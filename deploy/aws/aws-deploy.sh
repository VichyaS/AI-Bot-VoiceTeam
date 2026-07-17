#!/usr/bin/env bash
set -euo pipefail

AWS_REGION="${AWS_REGION:-ap-southeast-3}"
INSTANCE_NAME="${INSTANCE_NAME:-voice-bot-ec2}"
INSTANCE_TYPE="${INSTANCE_TYPE:-t3.small}"
INSTANCE_TYPE_FALLBACKS="${INSTANCE_TYPE_FALLBACKS:-t3.micro,t4g.small,t4g.micro}"
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

launch_instance() {
  local candidate_type="$1"
  local instance_id=""

  set +e
  instance_id="$(aws ec2 run-instances \
    --region "$AWS_REGION" \
    --image-id "$AMI_ID" \
    --instance-type "$candidate_type" \
    --key-name "$KEY_NAME" \
    --security-group-ids "$SECURITY_GROUP_ID" \
    --subnet-id "$SUBNET_ID" \
    --associate-public-ip-address \
    --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=${INSTANCE_NAME}}]" \
    --query 'Instances[0].InstanceId' \
    --output text 2>/tmp/aws_run_instances_error.log)"
  local status=$?
  set -e

  if [ $status -eq 0 ] && [ -n "$instance_id" ] && [ "$instance_id" != "None" ]; then
    echo "$instance_id"
    return 0
  fi

  return 1
}

echo "Launching EC2 instance..."
selected_type=""
INSTANCE_ID=""
IFS=',' read -r -a fallback_types <<< "$INSTANCE_TYPE_FALLBACKS"
candidate_types=("$INSTANCE_TYPE" "${fallback_types[@]}")

for candidate in "${candidate_types[@]}"; do
  candidate_trimmed="$(echo "$candidate" | xargs)"
  if [ -z "$candidate_trimmed" ]; then
    continue
  fi

  echo "Trying instance type: $candidate_trimmed"
  if INSTANCE_ID="$(launch_instance "$candidate_trimmed")"; then
    selected_type="$candidate_trimmed"
    break
  fi

  if [ -s /tmp/aws_run_instances_error.log ]; then
    echo "Failed with $candidate_trimmed: $(tail -n 1 /tmp/aws_run_instances_error.log)"
  fi
done

if [ -z "$INSTANCE_ID" ]; then
  echo "Unable to launch instance in region $AWS_REGION with configured candidates." >&2
  echo "Tried: ${candidate_types[*]}" >&2
  if [ -s /tmp/aws_run_instances_error.log ]; then
    echo "Last AWS error:" >&2
    cat /tmp/aws_run_instances_error.log >&2
  fi
  exit 1
fi

echo "Launched using instance type: $selected_type"

echo "Waiting for instance to enter running state..."
aws ec2 wait instance-running --region "$AWS_REGION" --instance-ids "$INSTANCE_ID"

PUBLIC_IP="$(aws ec2 describe-instances --region "$AWS_REGION" --instance-ids "$INSTANCE_ID" --query 'Reservations[0].Instances[0].PublicIpAddress' --output text)"
echo "Deployment complete. Instance: $INSTANCE_ID"
echo "Public IP: $PUBLIC_IP"
