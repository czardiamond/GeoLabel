FROM python:3.11-slim

WORKDIR /app

# ffprobe is used when available to validate video duration for segment labels.
RUN apt-get update && apt-get install --no-install-recommends -y ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Prevent Python from writing pyc files and enable unbuffered logging
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Install the authoritative backend dependency manifest
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

# Copy application code
COPY . /app
RUN useradd --system --uid 10001 --create-home geolabel \
    && chown -R geolabel:geolabel /app
USER geolabel

# Default port fallback if PORT is not set
ENV PORT=8000

CMD ["sh", "-c", "alembic upgrade head && uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
