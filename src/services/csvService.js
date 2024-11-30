const csv = require('csv-parser');
const fs = require('fs');
const logger = require('../utils/logger');

class CsvService {
    async processFile(filePath) {
        try {
            const results = [];
            
            return new Promise((resolve, reject) => {
                fs.createReadStream(filePath)
                    .pipe(csv({
                        mapValues: ({ header, value }) => value.trim()
                    }))
                    .on('data', (data) => {
                        logger.info('Processing CSV row:', data);
                        
                        // Check if the URL exists in any of the columns
                        const url = Object.values(data).find(value => 
                            value && value.includes('linkedin.com/in/')
                        );

                        if (url) {
                            results.push({
                                linkedinUrl: url,
                                status: 'pending'
                            });
                            logger.info('Added URL:', url);
                        } else {
                            logger.warn('No LinkedIn URL found in row:', data);
                        }
                    })
                    .on('end', () => {
                        logger.info(`Processed ${results.length} valid URLs`);
                        
                        if (results.length === 0) {
                            reject(new Error('No valid LinkedIn URLs found in CSV'));
                        } else {
                            resolve(results);
                        }
                    })
                    .on('error', (error) => {
                        logger.error('Error processing CSV:', error);
                        reject(error);
                    });
            });
        } catch (error) {
            logger.error('CSV processing error:', error);
            throw error;
        }
    }
}

module.exports = new CsvService(); 