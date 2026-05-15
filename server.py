from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from openai import AsyncOpenAI
import os
from dotenv import load_dotenv

# Load secret key from .env file
load_dotenv()

app = FastAPI()

# Allow your frontend to talk to this backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, change this to your actual website URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Set up the DeepSeek client
client = AsyncOpenAI(
    api_key=os.getenv("DEEPSEEK_API_KEY"),
    base_url="https://api.deepseek.com"
)

# Define what data the frontend will send
class ChatRequest(BaseModel):
    message: str

from pydantic import BaseModel

class ChatRequest(BaseModel):
    message: str

@app.post("/api/chat")
async def chat_with_sathee(request: ChatRequest):
    try:
        # Give the AI its personality and context
        system_prompt = """You are Apna Sathee, an expert AI counsellor for Indian students navigating JoSAA and JEE admissions. Keep answers concise, accurate, and encouraging.
        
Rule: If a user asks 'What colleges can I get with [Rank]?', do NOT provide a full list. Instead:
Give them only 1 or 2 high-level examples (e.g., 'With a 15k rank, you might look at mid-tier NITs like NIT Silchar or certain branches at IIITs').
Immediately follow up with: 'For a complete, personalized, and highly accurate list of all your options across IITs, NITs, and IIITs, please use the My Chances tool in your dashboard. It uses the latest JoSAA data to give you a definitive report.'"""
        
        response = await client.chat.completions.create(
            model="deepseek-chat",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": request.message}
            ],
            max_tokens=500
        )
        
        return {"reply": response.choices[0].message.content}
        
    except Exception as e:
        print(f"Error in chat: {e}")
        return {"error": str(e)}

@app.post("/api/compare-verdict")
async def get_compare_verdict(data: dict):
    try:
        c1 = data.get("college1")
        c2 = data.get("college2")
        
        prompt = f"""
        You are a JEE Counseling Expert. A student is confused between:
        1. {c1}
        2. {c2}
        
        Give a professional 'AI Verdict'. Compare them based on Placement Median Package, Campus Culture, and Future growth. End with "Our Pick: [College Name]". Keep it within 100 words.
        """
        
        # The crucial "await" is added here!
        response = await client.chat.completions.create(
            model="deepseek-chat",
            messages=[{"role": "user", "content": prompt}]
        )
        return {"verdict": response.choices[0].message.content}
        
    except Exception as e:
        print(f"Error in compare verdict: {e}")
        return {"error": str(e)}