import express from 'express';
import bodyParser from 'body-parser';
import { minePow } from 'nostr-tools/lib/types/nip13';

const app = express();
const port = 3000;

// Use body-parser middleware to parse JSON requests
app.use(bodyParser.json());

app.post('/powgen', async (req, res) => {
  try {
    const { unsigned, difficulty } = req.body;

    // Validate input
    if (!unsigned || !difficulty) {
      return res.status(400).send('Missing unsigned event or difficulty.');
    }

    // Call minePow function to generate PoW
    const result = minePow(unsigned, difficulty);

    // Send back the result
    res.json(result);
  } catch (error) {
    console.error('Error generating PoW:', error);
    res.status(500).send('Internal server error');
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
