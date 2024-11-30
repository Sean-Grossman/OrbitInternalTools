const express = require('express');
const dotenv = require('dotenv');
const errorHandler = require('./middleware/errorHandler');
const logger = require('./utils/logger');
const multer = require('multer');
const processController = require('./controllers/processController');
const path = require('path');

// Load environment variables
dotenv.config();

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes will be added here
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK' });
});

// Configure multer for file upload
const upload = multer({ dest: 'tmp/uploads/' });

// Add the route before error handling
app.post('/process-csv', upload.single('file'), processController.processProfiles);

// Serve static files
app.use(express.static(path.join(__dirname, '../public')));

// Add this route before your other routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Error handling
app.use(errorHandler);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    logger.info(`Server is running on port ${PORT}`);
});

module.exports = app; 