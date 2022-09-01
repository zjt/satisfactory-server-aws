#!/bin/bash
aws ec2 describe-instances \
  --filters Name=tag-value,Values=ServerHostingStack/SatisfactoryServer \
            Name=instance-state-name,Values=pending,running,shutting-down,stopping,stopped \
  --query Reservations[*].Instances[*]
  
NameFilter="Name=tag-value,Values=ServerHostingStack/SatisfactoryServer Name=instance-state-name,Values=pending,running,shutting-down,stopping,stopped"
AvailabilityZone=`aws ec2 describe-instances --filters $NameFilter --query Reservations[*].Instances[*].Placement.AvailabilityZone --output text`
InstanceId=`aws ec2 describe-instances --filters $NameFilter --query Reservations[*].Instances[*].InstanceId --output text`
SSHPublicKey="file:///home/ec2-user/.ssh/id_rsa.pub"
InstanceIpAddress=`aws ec2 describe-instances --filters $NameFilter --query Reservations[*].Instances[*].NetworkInterfaces[*].PrivateIpAddresses[*].PrivateIpAddress --output text`
InstancePublicIpAddress=`aws ec2 describe-instances --filters $NameFilter --query Reservations[*].Instances[*].NetworkInterfaces[*].PrivateIpAddresses[*].Association.PublicIp --output text`

echo ""
echo "Public IP Address is $InstancePublicIpAddress"
echo ""
echo "Instance Connect Send SSH Public Key $InstanceId $AvailabilityZone $SSHPublicKey"
aws ec2-instance-connect send-ssh-public-key \
    --instance-id $InstanceId \
    --ssh-public-key $SSHPublicKey \
    --availability-zone $AvailabilityZone \
    --instance-os-user ubuntu
echo ""
echo "Start server command:"
echo "aws ec2 start-instances --instance-id $InstanceId"
echo ""
echo "SSH command"
echo "ssh ubuntu@$InstanceIpAddress -C \"sudo systemctl disable auto-shutdown\""
echo "ssh ubuntu@$InstanceIpAddress"
echo ""
