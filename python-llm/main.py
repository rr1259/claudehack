from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from typing import List, Optional
import os
import json
import google.generativeai as genai


class FileSummary(BaseModel):
	name: str
	path: str
	type: str
	ext: Optional[str] = None
	size: Optional[int] = None
	atimeDays: Optional[int] = None


class OrganizeRequest(BaseModel):
	instructions: str = Field(..., description="Natural language organization instruction")
	files: List[FileSummary] = Field(default_factory=list)


class Move(BaseModel):
	from_: str = Field(..., alias="from")
	to: str
	reason: str


class OrganizeResponse(BaseModel):
	moves: List[Move] = Field(default_factory=list)


app = FastAPI(title="LLM Middleware", version="0.1.0")


def get_model():
	api_key = os.getenv("GOOGLE_API_KEY")
	if not api_key:
		raise RuntimeError("GOOGLE_API_KEY is not set")
	genai.configure(api_key=api_key)
	model_name = os.getenv("GEMINI_MODEL", "gemini-1.5-flash")
	return genai.GenerativeModel(model_name)


def build_prompt(instructions: str, files: List[FileSummary]) -> str:
	files_json = json.dumps([f.model_dump() for f in files])
	return "\n".join(
		[
			"You are an expert file librarian. Organize files according to the user instructions.",
			"Return strictly JSON with a top-level `moves` array of objects: { \"from\": string, \"to\": string, \"reason\": string }.",
			"Only move items within the /demo root. Keep file names the same unless necessary.",
			f"User instructions: {instructions}",
			f"Files: {files_json}",
		]
	)


def extract_json(text: str) -> dict:
	try:
		return json.loads(text)
	except Exception:
		pass
	# ```json ... ```
	if "```json" in text:
		try:
			content = text.split("```json", 1)[1].split("```", 1)[0]
			return json.loads(content)
		except Exception:
			pass
	# first { ... }
	first = text.find("{")
	last = text.rfind("}")
	if first != -1 and last != -1 and last > first:
		try:
			return json.loads(text[first : last + 1])
		except Exception:
			pass
	return {"moves": []}


@app.get("/health")
def health():
	return {"ok": True}

@app.post("/v1/organize", response_model=OrganizeResponse)
def organize(req: OrganizeRequest):
	try:
		model = get_model()
		prompt = build_prompt(req.instructions, req.files)
		resp = model.generate_content(prompt)
		if not resp or not resp.text:
			return OrganizeResponse(moves=[])
		data = extract_json(resp.text)
		moves = data.get("moves") or []
		# Validate and coerce with pydantic
		coerced = [Move.model_validate(m) for m in moves]
		return OrganizeResponse(moves=coerced)
	except Exception as e:
		raise HTTPException(status_code=500, detail=str(e))

