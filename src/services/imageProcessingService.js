const sharp = require('sharp');
const axios = require('axios');
const path = require('path');
const fs = require('fs').promises;
const logger = require('../utils/logger');

class ImageProcessingService {
    constructor() {
        this.tempDir = path.join(process.cwd(), 'tmp');
        this.ensureTempDir();
    }

    async ensureTempDir() {
        try {
            await fs.mkdir(this.tempDir, { recursive: true });
        } catch (error) {
            logger.error('Error creating temp directory:', error);
            throw error;
        }
    }

    async downloadImage(url) {
        try {
            const response = await axios({
                url,
                responseType: 'arraybuffer'
            });
            return Buffer.from(response.data, 'binary');
        } catch (error) {
            logger.error('Error downloading image:', error);
            throw error;
        }
    }

    async processProfilePicture(imageUrl, userId) {
        try {
            const imageBuffer = await this.downloadImage(imageUrl);
            const outputPath = path.join(this.tempDir, `${userId}_processed.png`);

            await sharp(imageBuffer)
                .resize(800, 800, {
                    fit: 'contain',
                    background: { r: 255, g: 255, b: 255, alpha: 1 }
                })
                .png()
                .toFile(outputPath);

            return outputPath;
        } catch (error) {
            logger.error('Error processing image:', error);
            throw error;
        }
    }

    async cleanup(filePath) {
        try {
            await fs.unlink(filePath);
        } catch (error) {
            logger.error('Error cleaning up file:', error);
        }
    }
}

module.exports = new ImageProcessingService(); 