#!/usr/bin/env bash
set -euo pipefail

AWS_REGION="${AWS_REGION:-ap-southeast-1}"
INSTANCE_NAME="${INSTANCE_NAME:-voice-bot-ec2}"
INSTANCE_TYPE="${INSTANCE_TYPE:-t3.small}"
AMI_ID="${AMI_ID:-resolve:ssm:/aws/service/canonical/ubuntu/server/24.04/stable/current/amd64/hvm/ebs-gp3/ami-id}"
KEY_NAME="${KEY_NAME:-voice-bot-key}"
SECURITY_GROUP_NAME="${SECURITY_GROUP_NAME:-voice-bot-sg}"
RTP_CIDR="${RTP_CIDR:-0.0.0.0/0}"
ADMIN_CIDR="${ADMIN_CIDR:-0.0.0.0/0}"

echo "Ensuring AWS key pair exists..."
if ! aws ec2 describe-key-pairs --region "$AWS_REGION" --key-names "$KEY_NAME" >/dev/null 2>&1; then
  aws ec2 create-key-pair --region "$AWS_REGION" --key-name "$KEY_NAME" --query 'KeyMaterial' --output text > "${KEY_NAME}.pem"
  chmod 600 "${KEY_NAME}.pem"
fi

DEFAULT_VPC_ID="$(aws ec2 describe-vpcs --region "$AWS_REGION" --filters Name=isDefault,Values=true --query 'Vpcs[0].VpcId' --output text)"
SUBNET_ID="$(aws ec2 describe-subnets --region "$AWS_REGION" --filters Name=vpc-id,Values="$DEFAULT_VPC_ID" Name=default-for-az,Values=true --query 'Subnets[0].SubnetId' --output text)"

echo "Ensuring security group exists..."
SECURITY_GROUP_ID="$(aws ec2 describe-security-groups --region "$AWS_REGION" --filters Name=group-name,Values="$SECURITY_GROUP_NAME" Name=vpc-id,Values="$DEFAULT_VPC_ID" --query 'SecurityGroups[0].GroupId' --output text)"
if [ "$SECURITY_GROUP_ID" = "None" ]; then
  SECURITY_GROUP_ID="$(aws ec2 create-security-group --region "$AWS_REGION" --group-name "$SECURITY_GROUP_NAME" --description "Voice bot SIP/TLS security group" --vpc-id "$DEFAULT_VPC_ID" --query 'GroupId' --output text)"
fi

authorize_rule() {
  local protocol="$1"
  local from_port="$2"
  local to_port="$3"
  local cidr="$4"
  aws ec2 authorize-security-group-ingress \
    --region "$AWS_REGION" \
    --group-id "$SECURITY_GROUP_ID" \
    --ip-permissions "IpProtocol=${protocol},FromPort=${from_port},ToPort=${to_port},IpRanges=[{CidrIp=${cidr}}]" >/dev/null 2>&1 || true
}

echo "Authorizing inbound ports..."
authorize_rule tcp 22 22 "$ADMIN_CIDR"
authorize_rule tcp 80 80 "$ADMIN_CIDR"
authorize_rule tcp 443 443 "$ADMIN_CIDR"
authorize_rule tcp 8080 8080 "$ADMIN_CIDR"
authorize_rule udp 5060 5060 "$RTP_CIDR"
authorize_rule tcp 5061 5061 "$RTP_CIDR"
authorize_rule udp 10000 20000 "$RTP_CIDR"

echo "Launching EC2 instance..."
INSTANCE_ID="$(aws ec2 run-instances \
  --region "$AWS_REGION" \
  --image-id "$AMI_ID" \
  --instance-type "$INSTANCE_TYPE" \
  --key-name "$KEY_NAME" \
  --security-group-ids "$SECURITY_GROUP_ID" \
  --subnet-id "$SUBNET_ID" \
  --associate-public-ip-address \
  --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=${INSTANCE_NAME}}]" \
  --query 'Instances[0].InstanceId' \
  --output text)"

echo "Waiting for instance to enter running state..."
aws ec2 wait instance-running --region "$AWS_REGION" --instance-ids "$INSTANCE_ID"

PUBLIC_IP="$(aws ec2 describe-instances --region "$AWS_REGION" --instance-ids "$INSTANCE_ID" --query 'Reservations[0].Instances[0].PublicIpAddress' --output text)"
echo "Deployment complete. Instance: $INSTANCE_ID"
echo "Public IP: $PUBLIC_IP"