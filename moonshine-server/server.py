from fastapi import FastAPI, File, UploadFile, Form
from fastapi.responses import JSONResponse
import uvicorn
import tempfile
import os

app = FastAPI(title="Moonshine STT Server")

transcriber = None

def get_transcriber(language="en"):
    global transcriber
    if transcriber is None:
        from moonshine_voice import Transcriber
        transcriber = Transcriber(language=language)
    return transcriber

@app.post("/transcribe")
async def transcribe(
    file: UploadFile = File(...),
    language: str = Form("en")
):
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp:
            content = await file.read()
            tmp.write(content)
            tmp_path = tmp.name
        
        t = get_transcriber(language)
        
        from moonshine_voice import load_wav_file
        audio_data, sample_rate = load_wav_file(tmp_path)
        
        results = []
        
        class Listener:
            def on_line_completed(self, event):
                results.append({
                    "text": event.line.text,
                    "start": event.line.start_time,
                    "end": event.line.end_time
                })
        
        t.add_listener(Listener())
        t.start()
        
        chunk_duration = 0.1
        chunk_size = int(chunk_duration * sample_rate)
        for i in range(0, len(audio_data), chunk_size):
            chunk = audio_data[i: i + chunk_size]
            t.add_audio(chunk, sample_rate)
        
        t.stop()
        os.unlink(tmp_path)
        
        full_text = " ".join([r["text"] for r in results])
        
        return JSONResponse({
            "text": full_text,
            "segments": results,
            "language": language,
            "duration": len(audio_data) / sample_rate if len(audio_data) > 0 else 0
        })
        
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"error": str(e)}
        )

@app.get("/health")
async def health():
    return {"status": "ok"}

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8765)
