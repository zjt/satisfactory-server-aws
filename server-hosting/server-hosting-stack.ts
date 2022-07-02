import { Duration, Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Config } from './config';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3_assets from 'aws-cdk-lib/aws-s3-assets';
import * as lambda_nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as apigw from 'aws-cdk-lib/aws-apigateway';
// npm i @matthewbonig/state-machine
import { StateMachine } from '@matthewbonig/state-machine'
import * as fs from "fs";
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as route53 from 'aws-cdk-lib/aws-route53'
import * as ssm from 'aws-cdk-lib/aws-ssm'
import * as certificatemanager from 'aws-cdk-lib/aws-certificatemanager'
import * as r53targets from 'aws-cdk-lib/aws-route53-targets'

export class ServerHostingStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // prefix for all resources in this stack
    const prefix = Config.prefix;

    //////////////////////////////////////////
    // Configure server, network and security
    //////////////////////////////////////////

    let lookUpOrDefaultVpc = (vpcId: string): ec2.IVpc => {
      // lookup vpc if given
      if (vpcId) {
        return ec2.Vpc.fromLookup(this, `${prefix}Vpc`, {
          vpcId
        })

        // use default vpc otherwise
      } else {
        return ec2.Vpc.fromLookup(this, `${prefix}Vpc`, {
          isDefault: true
        })
      }
    }

    let publicOrLookupSubnet = (subnetId: string, availabilityZone: string): ec2.SubnetSelection => {
      // if subnet id is given select it
      if (subnetId && availabilityZone) {
        return {
          subnets: [
            ec2.Subnet.fromSubnetAttributes(this, `${Config.prefix}ServerSubnet`, {
              availabilityZone,
              subnetId
            })
          ]
        };

        // else use any available public subnet
      } else {
        return { subnetType: ec2.SubnetType.PUBLIC };
      }
    }

    const vpc = lookUpOrDefaultVpc(Config.vpcId);
    const vpcSubnets = publicOrLookupSubnet(Config.subnetId, Config.availabilityZone);

    // configure security group to allow ingress access to game ports
    const securityGroup = new ec2.SecurityGroup(this, `${prefix}ServerSecurityGroup`, {
      vpc,
      description: "Allow Satisfactory client to connect to server",
    })

    securityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.udp(7777), "Game port")
    securityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.udp(15000), "Beacon port")
    securityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.udp(15777), "Query port")

    var serverInstanceType = Config.ServerInstanceType;
    if ( ! serverInstanceType ) {
      serverInstanceType = 'm5a.xlarge'
    }
    const server = new ec2.Instance(this, `${prefix}Server`, {
      // 2 vCPU, 8 GB RAM should be enough for most factories
      // or not!
      instanceType: new ec2.InstanceType(serverInstanceType),
      // get exact ami from parameter exported by canonical
      // https://discourse.ubuntu.com/t/finding-ubuntu-images-with-the-aws-ssm-parameter-store/15507
      machineImage: ec2.MachineImage.fromSsmParameter("/aws/service/canonical/ubuntu/server/20.04/stable/current/amd64/hvm/ebs-gp2/ami-id"),
      // storage for steam, satisfactory and save files
      blockDevices: [
        {
          deviceName: "/dev/sda1",
          volume: ec2.BlockDeviceVolume.ebs(15),
        }
      ],
      // server needs a public ip to allow connections
      vpcSubnets,
      userDataCausesReplacement: true,
      vpc,
      securityGroup,
    })

    // Add Base SSM Permissions, so we can use AWS Session Manager to connect to our server, rather than external SSH.
    server.role.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'));

    //////////////////////////////
    // Configure save bucket
    //////////////////////////////

    let findOrCreateBucket = (bucketName: string): s3.IBucket => {
      // if bucket already exists lookup and use the bucket
      if (bucketName) {
        return s3.Bucket.fromBucketName(this, `${prefix}SavesBucket`, bucketName);
        // if bucket does not exist create a new bucket
        // autogenerate name to reduce possibility of conflict
      } else {
        return new s3.Bucket(this, `${prefix}SavesBucket`);
      }
    }

    // allow server to read and write save files to and from save bucket
    const savesBucket = findOrCreateBucket(Config.bucketName);
    savesBucket.grantReadWrite(server.role);

    //////////////////////////////
    // Configure instance startup
    //////////////////////////////

    // add aws cli
    // needed to download install script asset and
    // perform backups to s3
    server.userData.addCommands('sudo apt-get install unzip -y')
    server.userData.addCommands('curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip" && unzip awscliv2.zip && ./aws/install')

    // package startup script and grant read access to server
    const startupScript = new s3_assets.Asset(this, `${Config.prefix}InstallAsset`, {
      path: './server-hosting/scripts/install.sh'
    });
    startupScript.grantRead(server.role);

    // download and execute startup script
    // with save bucket name as argument
    const localPath = server.userData.addS3DownloadCommand({
      bucket: startupScript.bucket,
      bucketKey: startupScript.s3ObjectKey,
    });
    server.userData.addExecuteFileCommand({
      filePath: localPath,
      arguments: `${savesBucket.bucketName} ${Config.useExperimentalBuild}`
    });

    //////////////////////////////
    // Add api to start server
    //////////////////////////////

    if (Config.restartApi && Config.restartApi === true) {
      const startServerLambda = new lambda_nodejs.NodejsFunction(this, `${Config.prefix}StartServerLambda`, {
        entry: './server-hosting/lambda/index.ts',
        description: "Restart game server",
        timeout: Duration.seconds(10),
        environment: {
          INSTANCE_ID: server.instanceId
        }
      })

      startServerLambda.addToRolePolicy(new iam.PolicyStatement({
        actions: [
          'ec2:StartInstances',
        ],
        resources: [
          `arn:aws:ec2:*:${Config.account}:instance/${server.instanceId}`,
        ]
      }))

      const startApi = new apigw.LambdaRestApi(this, `${Config.prefix}StartServerApi`, {
        handler: startServerLambda,
        description: "Trigger lambda function to start server",
        
      });
      
      // Create a role to for Step Functions state machine 
      const sfRole = new iam.Role(this, 'Role', {
          assumedBy: new iam.ServicePrincipal('states.amazonaws.com'),
          description: 'Role for step functions to interface with other AWS resources',
      });
      const sfDescribeNetworkInterfaces = new iam.PolicyStatement();
      sfDescribeNetworkInterfaces.addActions("ec2:DescribeInstances");
      sfDescribeNetworkInterfaces.addResources("*");
      sfRole.addToPolicy(sfDescribeNetworkInterfaces);
      const sfPutSSM = new iam.PolicyStatement();
      sfPutSSM.addActions("ssm:*");
      sfPutSSM.addResources("*");
      sfRole.addToPolicy(sfPutSSM);
      
      // Route 53 dns zone for the game
      var myZone;
      var myZoneID = "NOZONEFOUND"
      if (Config.Route53Zone) {
        // create the Route 53 zone
        myZone = new route53.PublicHostedZone(this, 'HostedZone', {
          zoneName: Config.Route53Zone
        });
      }
      else if ( Config.serverHostName ) {
        // lookup zone if name specified
        myZone = route53.HostedZone.fromLookup(this, 'MyZone', {
          domainName: Config.serverHostName,
        });
      }
      if ( myZone ) {
        // give the step function state machine permission to update the zone
        myZoneID = myZone.hostedZoneId;
        const sfR53ChangeRRS = new iam.PolicyStatement();
        sfR53ChangeRRS.addActions("route53:ChangeResourceRecordSets");
        sfR53ChangeRRS.addResources(`arn:aws:route53:::hostedzone/${myZoneID}`);
        sfRole.addToPolicy(sfR53ChangeRRS);
        // Create a certificate for the start server API gateway domain.
        // Ownership of the domain will be validated via DNS records created for us in the Hosted Zone.
        const certificate = new certificatemanager.Certificate(this, 'startApiCert', {
          domainName: Config.startApiName,
          validation: certificatemanager.CertificateValidation.fromDns(myZone)
        });
        // Configure the API gateway to use the domain and certificate
        startApi.addDomainName("startApiName", {
          domainName: Config.startApiName,
          certificate: certificate,
        });
        // Add the alias record to the zone
        new route53.ARecord(this, `startApiRecord`, {
          recordName: Config.startApiName,
          zone: myZone,
          target: route53.RecordTarget.fromAlias(new r53targets.ApiGateway(startApi)),
        });
      } // end of things to do if there is a Route 53 DNS zone to work with
      
      var DnsName = "NODNSNAME"
      if ( Config.serverHostName ) {
        DnsName = Config.serverHostName
      }

      // API gateway for Discord web hook, if defined
      const discordURL = Config.DiscordWebHook;
      const discordApi = new apigw.RestApi(this, `${Config.prefix}Discord`, {
        restApiName: `${Config.prefix}Discord`,
      });
      discordApi.root.addMethod(
        'POST', 
        new apigw.HttpIntegration(
          discordURL,
          { 
            httpMethod: "POST"
          }
        )
      );
      
      // get the API endpoint and stash it in SSM for the SF to query 
      var discordAPIGWEndpoint = discordApi.url;//"placeholder.execute-api.us-east-2.amazonaws.com";//Config.DiscordAPIGWEndpoint;
      discordAPIGWEndpoint = discordAPIGWEndpoint.split('/')[2];
      new ssm.StringParameter(  this, "discordAPIEndpoint", { 
        parameterName: "discordAPIEndpoint",
        stringValue: discordAPIGWEndpoint
      });
      
      // the server up and server down message is configurable in config.ts
      var serverUpMessage = Config.serverUpMessage;
      if ( ! serverUpMessage ) {
        serverUpMessage = "up"
      }
      var serverDownMessage = Config.serverDownMessage;
      if ( ! serverDownMessage ) {
        serverDownMessage = "down"
      }
      
      // Step Functions state machine to discover instance public IP
      const notifierSFSM = new StateMachine(this, 'Test', {
        stateMachineName: 'SatisfactoryNotifier',
        role: sfRole,
        definition: JSON.parse(fs.readFileSync('server-hosting/step-functions/state-machine.json').toString()),
        overrides: {
          "Ec2InstanceRunning": {
            "Choices": [{
              "StringEquals": `${server.instanceId}`
            }]
          },
          "Map": {
            "Iterator": {
              "States": {
                "IsSatisfactoryInstance": {
                  "Choices": [{
                    "StringEquals": `${server.instanceId}`
                  }]
                },
                "DiscordServerDown": {
                  "Parameters": {
                    "RequestBody": {
                      "content": serverDownMessage
                    }
                  }
                },
                "Change_DNS_IP": {
                  "Parameters": {
                    "ChangeBatch": {
                      "Changes": [
                        {
                          "ResourceRecordSet": {
                            "Name": DnsName
                          }
                        }
                      ]
                    },
                    "HostedZoneId": myZoneID
                  }
                },
                "DiscordServerUp": {
                  "Parameters": {
                    "RequestBody": {
                      "content": serverUpMessage
                    }
                  }
                }
              }
            }
          }
        }
      });
      
      // Step Function is a target for the EventBridge rule when EC2 instances are started
      const rule = new events.Rule(this, 'rule', {
        eventPattern: JSON.parse(`{ "source": ["aws.ec2"], "detail-type": ["EC2 Instance State-change Notification"], "detail": { "instance-id": ["${server.instanceId}"], "state": ["running", "stopped"]}}`),
      });
      rule.addTarget(new targets.SfnStateMachine(notifierSFSM));

    }
  }
}
