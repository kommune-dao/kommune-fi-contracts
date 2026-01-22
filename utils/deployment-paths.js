/**
 * Deployment file path helper
 * Provides consistent paths for deployment JSON files
 */

const path = require('path');

/**
 * Get deployment file path based on network and profile
 * @param {string} network - Network name (kaia, kairos)
 * @param {string} profile - Profile name (stable, balanced, v1) or null
 * @returns {string} - Absolute path to deployment file
 */
function getDeploymentPath(network, profile = null) {
    const baseDir = path.join(__dirname, '..');
    
    // Mainnet paths
    if (network === 'kaia' || network === 'cypress') {
        const actualNetwork = 'kaia';
        if (profile && profile !== 'v1') {
            return path.join(baseDir, 'deployments', 'mainnet', `${actualNetwork}-${profile}.json`);
        }
        // Legacy fallback
        return path.join(baseDir, 'deployments', 'archive', `deploy-${actualNetwork}.json`);
    }
    
    // Testnet paths
    if (network === 'kairos' || network === 'baobab') {
        const actualNetwork = 'kairos';
        if (profile && profile !== 'v1') {
            return path.join(baseDir, 'deployments', 'testnet', `${actualNetwork}-${profile}.json`);
        }
        if (profile === 'v1') {
            return path.join(baseDir, 'deployments', 'testnet', `${actualNetwork}-v1.json`);
        }
        // Legacy fallback
        return path.join(baseDir, 'deployments', 'archive', `deploy-${actualNetwork}.json`);
    }
    
    throw new Error(`Unknown network: ${network}`);
}

/**
 * Get legacy deployment path (for backward compatibility)
 * @param {string} network - Network name
 * @param {string} profile - Profile name or null
 * @returns {string} - Path in old format
 */
function getLegacyPath(network, profile = null) {
    const baseDir = path.join(__dirname, '..');
    
    if (profile && profile !== 'v1') {
        return path.join(baseDir, `deployments-${profile}-${network}.json`);
    }
    return path.join(baseDir, `deployments-${network}.json`);
}

/**
 * Check if file exists at given path
 * @param {string} filepath - File path to check
 * @returns {boolean} - True if file exists
 */
function fileExists(filepath) {
    const fs = require('fs');
    try {
        return fs.existsSync(filepath);
    } catch {
        return false;
    }
}

/**
 * Get deployment file path with fallback to legacy
 * @param {string} network - Network name
 * @param {string} profile - Profile name or null
 * @returns {string} - Deployment file path
 */
function getDeploymentPathWithFallback(network, profile = null) {
    const newPath = getDeploymentPath(network, profile);
    
    // If new path exists, use it
    if (fileExists(newPath)) {
        return newPath;
    }
    
    // Otherwise try legacy path
    const legacyPath = getLegacyPath(network, profile);
    if (fileExists(legacyPath)) {
        console.warn(`⚠️  Using legacy deployment path: ${legacyPath}`);
        console.warn(`   Consider migrating to: ${newPath}`);
        return legacyPath;
    }
    
    // Return new path anyway (will fail with clear error)
    return newPath;
}

module.exports = {
    getDeploymentPath,
    getLegacyPath,
    getDeploymentPathWithFallback,
    fileExists
};
