const testConfig = require('./testConfig');
const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const imagineApiService = require('../services/imagineApiService');
const logger = require('../utils/logger');

async function testDiscordIntegration() {
    try {
        logger.info('Starting Discord integration test');
        
        // Validate Discord token first
        await testConfig.validateDiscordToken();
        logger.info('Discord token validated');

        // Create test directory if it doesn't exist
        const testDir = path.join(__dirname, 'test-assets');
        await fs.mkdir(testDir, { recursive: true });
        logger.info('Test directory created/verified');

        // Create a simple test image if it doesn't exist
        const testImagePath = path.join(testDir, 'testImage.jpg');
        
        // Check if test image exists, if not create one
        try {
            await fs.access(testImagePath);
            logger.info('Found existing test image');
        } catch {
            logger.info('Downloading sample image...');
            try {
                const response = await axios.get(process.env.TEST_IMAGE_URL || 'https://media.licdn.com/dms/image/v2/D4E03AQGNQrONVbXujQ/profile-displayphoto-shrink_800_800/profile-displayphoto-shrink_800_800/0/1721237521273?e=1738800000&v=beta&t=e5g3zAmn8eLASGVSP1721c7pLoCn4pPYh1t7g0-S3WM', { 
                    responseType: 'arraybuffer',
                    timeout: 10000
                });
                logger.info('Sample image downloaded successfully');
                
                await fs.writeFile(testImagePath, response.data);
                logger.info('Sample image saved to disk');
            } catch (downloadError) {
                logger.error('Error downloading sample image:', downloadError);
                throw new Error(`Failed to download sample image: ${downloadError.message}`);
            }
        }

        // Read test image
        logger.info('Reading test image from disk');
        const imageBuffer = await fs.readFile(testImagePath);
        logger.info(`Image buffer loaded, size: ${imageBuffer.length}`);

        // Test pixel art generation
        const result = await imagineApiService.generatePixelArt(
            imageBuffer,
            'test_profile'
        );

        logger.info('Test completed successfully');
        logger.info('Generated pixel art URL:', result);

        return result;
    } catch (error) {
        logger.error('Test failed:', error);
        throw error;
    }
}

// Run the test if this file is executed directly
if (require.main === module) {
    testDiscordIntegration()
        .then(result => {
            console.log('Test completed successfully');
            console.log('Result:', result);
            process.exit(0);
        })
        .catch(error => {
            console.error('Test failed:', error.message);
            process.exit(1);
        });
}

module.exports = testDiscordIntegration; 