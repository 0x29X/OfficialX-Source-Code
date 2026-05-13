const fs = require('fs');
const path = require('path');

const statusConfigPath = path.join(__dirname, '../status-config.json');

let customStatuses = [];
try {
    if (fs.existsSync(statusConfigPath)) {
        const data = fs.readFileSync(statusConfigPath, 'utf8');
        customStatuses = JSON.parse(data);
    }
} catch (err) {
    customStatuses = [];
}

module.exports = {
    customStatuses,
    statusConfigPath
};
