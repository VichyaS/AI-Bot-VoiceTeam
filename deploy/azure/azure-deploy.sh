#!/usr/bin/env bash
set -euo pipefail

RESOURCE_GROUP="${RESOURCE_GROUP:-voice-bot-rg}"
LOCATION="${LOCATION:-eastus}"
VM_NAME="${VM_NAME:-voice-bot-vm}"
ADMIN_USERNAME="${ADMIN_USERNAME:-azureuser}"
SSH_PUBLIC_KEY_PATH="${SSH_PUBLIC_KEY_PATH:-$HOME/.ssh/id_rsa.pub}"
IMAGE="Ubuntu2204"
RTP_PORT_RANGE="${RTP_PORT_RANGE:-10000-20000}"

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

NIC_ID="$(az vm show --resource-group "$RESOURCE_GROUP" --name "$VM_NAME" --query 'networkProfile.networkInterfaces[0].id' -o tsv)"
NSG_ID="$(az network nic show --ids "$NIC_ID" --query 'networkSecurityGroup.id' -o tsv)"

echo "Opening required ports for HTTP, HTTPS, SIP, SIP/TLS, and RTP..."
az network nsg rule create --ids "$NSG_ID" --name Allow-HTTP-80 --priority 1000 --access Allow --direction Inbound --protocol Tcp --destination-port-ranges 80 >/dev/null
az network nsg rule create --ids "$NSG_ID" --name Allow-HTTPS-443 --priority 1010 --access Allow --direction Inbound --protocol Tcp --destination-port-ranges 443 >/dev/null
az network nsg rule create --ids "$NSG_ID" --name Allow-SIP-UDP-5060 --priority 1020 --access Allow --direction Inbound --protocol Udp --destination-port-ranges 5060 >/dev/null
az network nsg rule create --ids "$NSG_ID" --name Allow-SIP-TLS-5061 --priority 1030 --access Allow --direction Inbound --protocol Tcp --destination-port-ranges 5061 >/dev/null
az network nsg rule create --ids "$NSG_ID" --name Allow-RTP-UDP --priority 1040 --access Allow --direction Inbound --protocol Udp --destination-port-ranges "$RTP_PORT_RANGE" >/dev/null

echo "Deployment complete."
echo "Use: az vm show --resource-group $RESOURCE_GROUP --name $VM_NAME --show-details --query publicIps -o tsv"
