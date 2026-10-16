# crayZmundo Engine — one image, runs the API and the worker in a single process.
FROM python:3.12-slim

# ffmpeg does the cutting and rendering; the fonts are what captions are drawn in.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg curl ca-certificates \
      fonts-dejavu-core fontconfig \
 && rm -rf /var/lib/apt/lists/*

# Caption faces named by the style presets. Missing ones fall back, so a failed
# download never breaks a build.
RUN mkdir -p /usr/share/fonts/truetype/crayz && cd /usr/share/fonts/truetype/crayz && \
    for f in \
      "Montserrat/Montserrat-ExtraBold.ttf" \
      "Anton/Anton-Regular.ttf" \
      "PlayfairDisplay/PlayfairDisplay%5Bwght%5D.ttf" \
      "PermanentMarker/PermanentMarker-Regular.ttf" \
      "Bangers/Bangers-Regular.ttf" \
      "LuckiestGuy/LuckiestGuy-Regular.ttf" ; do \
      curl -fsSL -O "https://github.com/google/fonts/raw/main/ofl/$(echo $f | tr 'A-Z' 'a-z' | cut -d/ -f1)/$(basename $f)" || true ; \
    done && fc-cache -f

# The face detector OpenCV needs. Without it the Engine falls back to motion
# tracking, which works but is less precise on talking heads.
RUN mkdir -p /models && \
    curl -fsSL -o /models/face_detection_yunet.onnx \
      "https://raw.githubusercontent.com/opencv/opencv_zoo/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx" || \
    echo "note: face model not fetched; motion tracking will be used"
ENV FACE_MODEL_PATH=/models/face_detection_yunet.onnx

WORKDIR /app
COPY pyproject.toml ./
RUN pip install --no-cache-dir \
      "fastapi>=0.115" "uvicorn[standard]>=0.30" "sqlmodel>=0.0.22" "pydantic-settings>=2.4" \
      "python-multipart>=0.0.9" "httpx>=0.27" \
      "faster-whisper>=1.0" "opencv-python-headless>=4.9" "numpy>=1.26" "yt-dlp>=2024.8.6" \
      "boto3>=1.34"

COPY app ./app
RUN useradd -m engine && mkdir -p /data && chown -R engine /data /app
USER engine
ENV DATA_DIR=/data
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD curl -fsS http://localhost:8080/v1/health || exit 1
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
