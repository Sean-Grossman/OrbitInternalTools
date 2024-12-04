const sharp = require('sharp');
const axios = require('axios');
const path = require('path');
const fs = require('fs').promises;
const logger = require('../utils/logger');
const imagineApiService = require('./imagineApiService');

/**
 * Service for processing profile images and generating pixel art
 * Flow:
 * 1. Downloads profile picture from LinkedIn URL
 * 2. Processes original image (resizing, optimization)
 * 3. Sends image to Discord for pixel art generation
 * 4. Downloads resulting pixel art
 * 5. Saves both original and pixel art versions
 */
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
            
            // Process original image
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

            // Generate pixel art version
            const pixelArtUrl = await imagineApiService.generatePixelArt(imageBuffer, filename);
            
            // Download and save pixel art
            const pixelArtBuffer = await this.downloadImage(pixelArtUrl);
            const pixelArtPath = path.join(this.outputDir, `${filename}_pixel.png`);
            await sharp(pixelArtBuffer).toFile(pixelArtPath);

            logger.info(`Images processed and saved: ${outputPath}, ${pixelArtPath}`);
            return {
                originalPath: outputPath,
                pixelArtPath: pixelArtPath
            };

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