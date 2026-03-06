from fastapi import FastAPI, File, UploadFile, Form
from fastapi.responses import JSONResponse
import uvicorn
import tempfile
import os
import subprocess

app = FastAPI(title="Moonshine STT Server")

transcriber = None

def get_transcriber(language="en"):
    global transcriber
    if transcriber is None:
        from moonshine_voice import Transcriber
        transcriber = Transcriber(language=language)
    return transcriber

def convert_to_wav(input_path: str) -> str:
    """Convert audio file to WAV format using ffmpeg"""
    output_path = input_path.replace(os.path.splitext(input_path)[1], ".wav")
    try:
        subprocess.run([
            "ffmpeg", "-i", input_path,
            "-ar", "16000",  # 16kHz sample rate
            "-ac", "1",      # mono
            "-y",            # overwrite
            output_path
        ], check=True, capture_output=True)
        return output_path
    except subprocess.CalledProcessError as e:
        raise Exception(f"Audio conversion failed: {e.stderr.decode()}")

@app.post("/transcribe")
async def transcribe(
    file: UploadFile = File(...),
    language: str = Form("en")
):
    tmp_path = None
    wav_path = None
    try:
        # Save uploaded file
        suffix = os.path.splitext(file.filename or "audio.webm")[1] or ".webm"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            content = await file.read()
            tmp.write(content)
            tmp_path = tmp.name
        
        # Convert to WAV if needed
        if suffix.lower() != ".wav":
            wav_path = convert_to_wav(tmp_path)
        else:
            wav_path = tmp_path
        
        t = get_transcriber(language)
        
        from moonshine_voice import load_wav_file
        audio_data, sample_rate = load_wav_file(wav_path)
        
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
        
        # Cleanup
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)
        if wav_path and wav_path != tmp_path and os.path.exists(wav_path):
            os.unlink(wav_path)
        
        full_text = " ".join([r["text"] for r in results])
        
        return JSONResponse({
            "text": full_text,
            "segments": results,
            "language": language,
            "duration": len(audio_data) / sample_rate if len(audio_data) > 0 else 0
        })
        
    except Exception as e:
        # Cleanup on error
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.unlink(tmp_path)
            except:
                pass
        if wav_path and wav_path != tmp_path and os.path.exists(wav_path):
            try:
                os.unlink(wav_path)
            except:
                pass
        return JSONResponse(
            status_code=500,
            content={"error": str(e)}
        )

@app.get("/health")
async def health():
    return {"status": "ok"}

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8765)
