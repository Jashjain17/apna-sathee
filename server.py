from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from openai import AsyncOpenAI
import os
import json
import re
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

# Load Official Rules JSON for RAG
official_rules_chunks = []
try:
    with open('josaa_official_rules.json', 'r', encoding='utf-8') as f:
        official_rules_chunks = json.load(f)
except Exception as e:
    print(f"Warning: Could not load official rules json: {e}")

# Load additional general knowledge contexts
knowledge_context = ""
try:
    counselling = json.load(open('counselling_process.json', 'r', encoding='utf-8'))
    categories = json.load(open('categories.json', 'r', encoding='utf-8'))
    docs = json.load(open('documents_required.json', 'r', encoding='utf-8'))
    exams = json.load(open('exams.json', 'r', encoding='utf-8'))
    branches = json.load(open('branches_careers.json', 'r', encoding='utf-8'))
    special = json.load(open('special_cases_prediction.json', 'r', encoding='utf-8'))
    
    knowledge_context = f"""
KNOWLEDGE BASE SUMMARY:
- Counselling Process: {str(counselling)[:1500]}
- Categories & Quotas: {str(categories)[:1000]}
- Documents Required: {str(docs)[:1000]}
- Exam Rules: {str(exams)[:1000]}
- Branches & Careers: {str(branches)[:1000]}
- Special Cases: {str(special)[:1000]}
"""
except Exception as e:
    print(f"Warning: Could not load additional knowledge files: {e}")

def get_relevant_context(query, chunks, top_k=4):
    if not chunks:
        return ""
    
    # Basic keyword extraction matching
    query_words = [w for w in re.sub(r'[^a-z0-9\s]', '', query.lower()).split() if len(w) > 2]
    
    scored_chunks = []
    for chunk in chunks:
        content_lower = chunk.get('content', '').lower()
        score = sum(1 for word in query_words if word in content_lower)
        scored_chunks.append((score, chunk))
        
    scored_chunks.sort(key=lambda x: x[0], reverse=True)
    top_chunks = [chunk for score, chunk in scored_chunks[:top_k] if score > 0]
    
    if not top_chunks:
        return ""
        
    context = "\n\nOFFICIAL JOSAA RULES & CERTIFICATES (SEARCH RESULTS):\n"
    for c in top_chunks:
        context += f"[Source: {c.get('source', 'Unknown')}]\n{c.get('content', '')}\n\n"
    return context

@app.post("/api/chat")
async def chat_with_sathee(request: ChatRequest):
    try:
        rules_context = get_relevant_context(request.message, official_rules_chunks)
        
        system_prompt = f"""You are Apna Sathee, an expert AI counsellor for Indian students navigating JoSAA and JEE admissions. Keep answers concise, accurate, and encouraging.
        
Rule: If a user asks 'What colleges can I get with [Rank]?', do NOT provide a full list. Instead:
Give them only 1 or 2 high-level examples (e.g., 'With a 15k rank, you might look at mid-tier NITs like NIT Silchar or certain branches at IIITs').
Immediately follow up with: 'For a complete, personalized, and highly accurate list of all your options across IITs, NITs, and IIITs, please use the My Chances tool in your dashboard. It uses the latest JoSAA data to give you a definitive report.'

GENERAL KNOWLEDGE CONTEXT:
{knowledge_context}

STRICT INSTRUCTION: You must answer user questions by searching through this official document context below (if provided). If a user asks about deadlines, freeze/float options, or certificates, you must cite the rules. If the answer is not in the document context provided and you are unsure, you must strictly reply: 'I cannot provide a safe answer for this. Please consult the official JoSAA authority.'
{rules_context}"""
        
        response = await client.chat.completions.create(
            model="deepseek-chat",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": request.message}
            ],
            max_tokens=500,
            temperature=0
        )
        
        return {"reply": response.choices[0].message.content}
        
    except Exception as e:
        print(f"Error in chat: {e}")
        return {"error": str(e)}

@app.post("/api/compare-verdict")
async def get_compare_verdict(data: dict):
    try:
        import urllib.request
        
        c1 = data.get("college1", "")
        b1 = data.get("branch1", "")
        c2 = data.get("college2", "")
        b2 = data.get("branch2", "")
        
        # 1. Tavily Search Integration
        tavily_key = os.getenv("TAVILY_API_KEY")
        tavily_context = ""
        if tavily_key:
            query = f"Official placement average package highest package and total fees estimation for engineering at {c1} {b1} and {c2} {b2}"
            url = "https://api.tavily.com/search"
            headers = {"Content-Type": "application/json"}
            payload = {
                "api_key": tavily_key,
                "query": query,
                "max_results": 3
            }
            try:
                req = urllib.request.Request(url, data=json.dumps(payload).encode('utf-8'), headers=headers)
                with urllib.request.urlopen(req) as res:
                    res_data = json.loads(res.read().decode('utf-8'))
                    results = res_data.get("results", [])
                    tavily_context = "\n\n".join([r.get("content", "") for r in results])
            except Exception as search_err:
                print(f"Tavily search error: {search_err}")
                
        # 2. DeepSeek Hookup
        system_prompt = f"""You are the elite Senior AI Career Counselor at Apna Sathee. Your task is to provide a comprehensive, deep-dive comparison between two engineering choices selected by an aspirant:
Option 1: {c1} {b1}
Option 2: {c2} {b2}

Live Web Context Provided (Use this data for your answer):
{tavily_context}

CRITICAL RULES:
1. Extract the exact placement statistics (average CTC, highest package) and total fees from the provided live web context. Do not invent fake decimal metrics.
2. If specific numbers are completely missing from the search snippets, do not hallucinate—provide a strong qualitative tier comparison instead.

Format the entire output in clean Markdown using these exact headers:
### 📊 The Live Outcome Comparison Matrix
(Build a clean markdown table comparing Average Package, Highest Package, Estimated Total Fees)

### 🏫 Legacy & Network Value
(Deep analysis comparing institutional brand value, alumni footprint, and tier strength)

### 💻 Branch Future Trajectory
(Analyze industry demand, tech market adaptability, and core vs non-core scope for these streams)

### 🎯 Apna Sathee Final Verdict
(Give a confident recommendation advising the family on which exact option they should lock in their preference list tonight based on long-term career value and ROI)"""
        
        response = await client.chat.completions.create(
            model="deepseek-chat",
            messages=[{"role": "system", "content": system_prompt}]
        )
        return {"verdict": response.choices[0].message.content}
        
    except Exception as e:
        print(f"Error in compare verdict: {e}")
        return {"error": str(e)}