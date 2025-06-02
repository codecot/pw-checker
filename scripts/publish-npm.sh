#!/bin/bash
# Script to assist with publishing the package to npm

set -e

# Colors for terminal output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Publishing @codecot/pw-checker to npmjs.com${NC}"

# Step 1: Ensure we're logged in to npm
echo -e "${YELLOW}Checking npm login status...${NC}"
if ! npm whoami &> /dev/null; then
  echo -e "${YELLOW}You need to login to npm first.${NC}"
  npm login
else
  echo -e "${GREEN}Already logged in as $(npm whoami)${NC}"
fi


# Ask for version increment type
echo -e "${YELLOW}Select version increment type:${NC}"
echo "1) patch (1.0.0 -> 1.0.1) - for bug fixes"
echo "2) minor (1.0.0 -> 1.1.0) - for new features"
echo "3) major (1.0.0 -> 2.0.0) - for breaking changes"
read -p "Enter choice [1-3]: " VERSION_TYPE

case $VERSION_TYPE in
  1) VERSION_TYPE="patch" ;;
  2) VERSION_TYPE="minor" ;;
  3) VERSION_TYPE="major" ;;
  *) echo -e "${RED}Invalid option. Defaulting to patch version.${NC}"; VERSION_TYPE="patch" ;;
esac

# Get the current version
CURRENT_VERSION=$(node -p "require('./package.json').version")
echo -e "${YELLOW}Current version: ${CURRENT_VERSION}${NC}"

# Increment version
echo -e "${YELLOW}Incrementing ${VERSION_TYPE} version...${NC}"
npm version $VERSION_TYPE --no-git-tag-version

# Get the new version
NEW_VERSION=$(node -p "require('./package.json').version")
echo -e "${GREEN}New version: ${NEW_VERSION}${NC}"

# Step 2: Verify the package.json
echo -e "${YELLOW}Verifying package.json...${NC}"
if ! grep -q '"name": "@codecot/pw-checker"' package.json; then
  echo -e "${RED}Error: Package name in package.json should be @codecot/pw-checker${NC}"
  exit 1
fi

# Step 3: Build the package
echo -e "${YELLOW}Building package...${NC}"
npm run build

# Step 4: Run npm pack to see what would be published
echo -e "${YELLOW}Dry run with npm pack to check the contents...${NC}"
npm pack --dry-run

# Step 5: Ask for confirmation
echo -e "${YELLOW}Do you want to publish this package to npm? (y/n)${NC}"
read -r CONFIRM
if [[ "$CONFIRM" != "y" && "$CONFIRM" != "Y" ]]; then
  echo -e "${RED}Publication canceled.${NC}"
  exit 0
fi

# Step 6: Publish
echo -e "${YELLOW}Publishing package...${NC}"
npm publish --access public

echo -e "${GREEN}✅ Package published successfully!${NC}"
echo -e "${BLUE}You can now install it with: npm install -g @codecot/pw-checker${NC}"
echo -e "${BLUE}Or run it directly with: npx @codecot/pw-checker${NC}"
