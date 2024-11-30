const sharp = require('sharp');
const axios = require('axios');
const path = require('path');
const fs = require('fs').promises;
const logger = require('../utils/logger');

class ImageProcessingService {
    constructor() {
        this.outputDir = path.join(process.cwd(), 'processed_images');
        this.ensureOutputDirectory();
        
        // Configure Sharp defaults
        sharp.cache(false); // Disable caching for memory efficiency
        sharp.concurrency(1); // Limit concurrent processing
    }

    async ensureOutputDirectory() {
        try {
            await fs.mkdir(this.outputDir, { recursive: true });
        } catch (error) {
            logger.error('Error creating output directory:', error);
            throw new Error('Failed to create output directory');
        }
    }

    async downloadImage(url) {
        try {
            logger.info(`Downloading image from: ${url}`);
            const response = await axios({
                url,
                responseType: 'arraybuffer',
                timeout: 10000 // 10 second timeout
            });
            return Buffer.from(response.data, 'binary');
        } catch (error) {
            logger.error('Error downloading image:', error);
            throw new Error(`Failed to download image: ${error.message}`);
        }
    }

    async processProfilePicture(imageUrl, filename) {
        let tempFilePath = null;
        try {
            logger.info(`Processing profile picture for: ${filename}`);
            
            const imageBuffer = await this.downloadImage(imageUrl);
            
            // Validate image before processing
            await sharp(imageBuffer).metadata();
            
            const outputPath = path.join(this.outputDir, `${filename}.png`);
            
            await sharp(imageBuffer)
                .resize(800, 800, {
                    fit: 'contain',
                    background: { r: 255, g: 255, b: 255, alpha: 1 }
                })
                .png({
                    quality: 90,
                    compressionLevel: 9,
                    palette: true
                })
                .toFile(outputPath);

            logger.info(`Image processed and saved to: ${outputPath}`);
            return outputPath;

        } catch (error) {
            logger.error('Error processing profile picture:', error);
            if (tempFilePath) {
                try {
                    await fs.unlink(tempFilePath);
                } catch (cleanupError) {
                    logger.error('Error cleaning up temporary file:', cleanupError);
                }
            }
            throw new Error(`Failed to process profile picture: ${error.message}`);
        }
    }

    async cleanup() {
        try {
            const files = await fs.readdir(this.outputDir);
            await Promise.all(
                files.map(file => 
                    fs.unlink(path.join(this.outputDir, file))
                        .catch(error => logger.error(`Failed to delete file ${file}:`, error))
                )
            );
            logger.info('Cleaned up processed images');
        } catch (error) {
            logger.error('Error cleaning up processed images:', error);
            throw error;
        }
    }
}

module.exports = new ImageProcessingService(); 