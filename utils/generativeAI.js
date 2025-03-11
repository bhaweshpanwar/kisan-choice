const dotenv = require('dotenv');
dotenv.config({ path: './config.env' });

const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY);

exports.generateFarmerBio = async (experience, specialization, location) => {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const prompt = `Write a well-structured and engaging bio for an Indian farmer with ${experience} years of experience in ${specialization}, located in ${location}. 

    The bio should be written in the first person, as if the farmer is introducing themselves. Keep it natural, warm, and informative. 
    
    Highlight:
    - The farmer’s dedication and passion for agriculture.
    - Any traditional or modern techniques they use.
    - Their commitment to quality and sustainability.
    - If relevant, their family's history in farming.
    
    Keep it concise but meaningful (around 2-3 sentences). Avoid including the farmer’s name.`;

    const response = await model.generateContent(prompt);

    if (
      !response ||
      !response.response ||
      !response.response.candidates ||
      !response.response.candidates[0].content
    ) {
      throw new Error('Invalid AI response format');
    }

    return response.response.candidates[0].content.parts[0].text;
  } catch (error) {
    console.error('Error generating farmer bio:', error);
    return (
      'Experienced Indian farmer specializing in ' +
      specialization +
      ' with ' +
      experience +
      ' years of expertise.'
    );
  }
};
