#!/usr/bin/env bash
set -euo pipefail

RESOURCE_GROUP="${RESOURCE_GROUP:-voice-bot-rg}"
LOCATION="${LOCATION:-eastus}"
VM_NAME="${VM_NAME:-voice-bot-vm}"
ADMIN_USERNAME="${ADMIN_USERNAME:-azureuser}"
SSH_PUBLIC_KEY_PATH="${SSH_PUBLIC_KEY_PATH:-$HOME/.ssh/id_rsa.pub}"
IMAGE="Ubuntu2204"

if [[ ! -f "$SSH_PUBLIC_KEY_PATH" ]]; then
  echo "SSH public key not found at $SSH_PUBLIC_KEY_PATH" >&2
  exit 1
fi

echo "Creating resource group $RESOURCE_GROUP in $LOCATION..."
az group create --name "$RESOURCE_GROUP" --location "$LOCATION"

echo "Creating Ubuntu VM $VM_NAME..."
az vm create \
  --resource-group "$RESOURCE_GROUP" \
  --name "$VM_NAME" \
  --image "$IMAGE" \
  --size Standard_B2s \
  --admin-username "$ADMIN_USERNAME" \
  --generate-ssh-keys \
  --public-ip-sku Standard

echo "Opening required ports for HTTP, HTTPS, SIP, and RTP..."
az vm open-port --resource-group "$RESOURCE_GROUP" --name "$VM_NAME" --port 80 --priority 1000
az vm open-port --resource-group "$RESOURCE_GROUP" --name "$VM_NAME" --port 443 --priority 1001
az vm open-port --resource-group "$RESOURCE_GROUP" --name "$VM_NAME" --port 5060 --priority 1002
az vm open-port --resource-group "$RESOURCE_GROUP" --name "$VM_NAME" --port 5061 --priority 1003
az vm open-port --resource-group "$RESOURCE_GROUP" --name "$VM_NAME" --port 10000-20000 --priority 1004

echo "Deployment complete."
echo "Use: az vm show --resource-group $RESOURCE_GROUP --name $VM_NAME --show-details --query publicIps -o tsv"
