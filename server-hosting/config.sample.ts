export const Config = {
     // Route 53 zone (optional - a zone will be created but you need to make it authoritative manually)
     // If the zone exists then that will be used instead
     Route53Zone: '', // leave blank if you do not want the IP address to be updated with a name record in the zone
     Route53Name: 'satisfactory.example.invalid',
     
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
