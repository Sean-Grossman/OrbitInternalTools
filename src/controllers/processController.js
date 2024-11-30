const csvService = require('../services/csvService');
const linkedinService = require('../services/linkedinService');
const imageProcessingService = require('../services/imageProcessingService');
const logger = require('../utils/logger');

class ProcessController {
    async processProfiles(req, res, next) {
        try {
            if (!req.file) {
                throw new Error('No CSV file uploaded');
            }

            // Process CSV file
            const profiles = await csvService.processFile(req.file.path);
            
            // Process each profile
            const results = [];
            const batchSize = 5; // Process 5 profiles at a time
            
            for (let i = 0; i < profiles.length; i += batchSize) {
                const batch = profiles.slice(i, i + batchSize);
                const batchPromises = batch.map(async (profile) => {
                    try {
                        // Validate LinkedIn URL
                        if (!await linkedinService.validateUrl(profile.linkedinUrl)) {
                            return {
                                url: profile.linkedinUrl,
                                status: 'failed',
                                error: 'Invalid LinkedIn URL format'
                            };
                        }

                        // Get profile data
                        const profileData = await linkedinService.getProfileData(profile.linkedinUrl);
                        
                        if (!profileData.profilePicture) {
                            return {
                                url: profile.linkedinUrl,
                                status: 'failed',
                                error: 'No profile picture URL available'
                            };
                        }

                        // Process profile picture
                        const processedImagePath = await imageProcessingService.processProfilePicture(
                            profileData.profilePicture,
                            profileData.fullName.replace(/\s+/g, '_')
                        );

                        return {
                            url: profile.linkedinUrl,
                            status: 'success',
                            processedImagePath
                        };

                    } catch (error) {
                        return {
                            url: profile.linkedinUrl,
                            status: 'failed',
                            error: error.message
                        };
                    }
                });

                const batchResults = await Promise.all(batchPromises);
                results.push(...batchResults);
            }

            res.json({
                status: 'success',
                results
            });

        } catch (error) {
            next(error);
        }
    }
}

module.exports = new ProcessController(); 