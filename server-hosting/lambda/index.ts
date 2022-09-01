import { EC2Client, StartInstancesCommand } from "@aws-sdk/client-ec2";

const instanceId = process.env.INSTANCE_ID
const client = new EC2Client({ region: process.env.AWS_REGION });
const command = new StartInstancesCommand({ InstanceIds: [instanceId!] });
const stealthMode = process.env.STEALTH_MODE

exports.handler = async function (event: any) {

  console.log("Attempting to start game server", instanceId);

  return client.send(command)
    .then((res) => {
      console.log(JSON.stringify(res));
      var body = JSON.stringify({ message: "Started satisfactory server", response: JSON.stringify(res) });
      if ( true ) {
        body = "hello"
      }
      return {
        statusCode: 200,
        headers: { "Content-Type": "text/json" },
        body: body
      }
    })
    .catch((err) => {
      console.log(JSON.stringify(err));
      var body = JSON.stringify({ message: "Failed to start satisfactory server", response: JSON.stringify(err) });
      if ( true ) {
        body = "fail"
      }
      return {
        statusCode: 200,
        headers: { "Content-Type": "text/json" },
        body: body
      }
    });
}
