const fs = require('fs');
const path = require('path');

const packagesFile = '/app/the-tool/pipeline/package-data/lists/packages-of-interest.txt';
const packages = fs.readFileSync(packagesFile, 'utf-8')
  .split('\n')
  .slice(5020)

const packagesDirectory = '/app/the-tool/pipeline/packages';
packages.forEach(folderName => {
  const folderPath = path.join(packagesDirectory, folderName);

  // Check if the folder exists
  if (fs.existsSync(folderPath)) {
    // Remove the folder recursively
    fs.rmdirSync(folderPath, { recursive: true });
    console.log(`Removed folder: ${folderPath}`);
  } else {
    console.log(`Folder does not exist: ${folderPath}`);
  }
});