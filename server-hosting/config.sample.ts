export const Config = {
     // Route 53 zone (optional - a zone will be created but you need to make it authoritative manually)
     // If the zone exists then that will be used instead
     Route53Zone: 'satisfactory.examplt.invalid', // leave blank if you do not want the IP address to be updated with a name record in the zone
     serverHostName: 'satisfactory.example.invalid', // if this zone exists then it will be updated if Route53Zone isn't defined
     startApiName: 'start.satisfactory.example.invalid', // must be subdomain within the zone (if it exists)
     FunctionURL: false, // experimental
     StealthMode: true, // don't show information in the start API
     
     // discord web hook
     DiscordWebHook: '',
     
     // instance type
     ServerInstanceType: 'm5a.xlarge',
     
     // customize the discord notifications here
     serverUpMessage: 'server up at: satisfactory.example.invalid',
     serverDownMessage: 'server down (satisfactory.example.invalid)',
     
     // assign tags to all of the taggable resources (e.g. for cost-allocation)
     tagKey: "app",
     tagVal: "satisfactory",
     
     // Open port 22 on the server - Allowed IP/CIDR
     OpenSSHPort: "172.31.32.0/20",
     
     // compulsory parameters

     // server hosting region
     region: '',
     // server hosting account
     account: '',
     // prefix for all resources in this app
     prefix: 'SatisfactoryHosting',
     // set to false if you don't want an api to
     // restart game server and true if you do
     restartApi: true,
     // Set to true if you want to use Satisfactory Experimental
     useExperimentalBuild: false,

     // optional parameters

     // bucket for storing save files
     // you can use an existing bucket
     // or leave it empty to create a new one
     bucketName: '',
     // server hosting vpc
     // Create a vpc and it's id here
     // or leave it empty to use default vpc
     vpcId: '',
     // specify server subnet
     // leave blank (preferred option) for auto-placement
     // If vpc is given specify subnet for that vpc
     // If vpc is not given specify subnet for default vpc
     subnetId: '',
     // Needed if subnetId is specified (i.e. us-west-2a)
     availabilityZone: ''
};
