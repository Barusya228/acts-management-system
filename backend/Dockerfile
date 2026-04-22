FROM node:20-alpine AS frontend-builder

WORKDIR /frontend

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
RUN mkdir -p public
ENV NEXT_PUBLIC_API_URL=
RUN npm run build

FROM node:20-slim

WORKDIR /app

# Install backend system dependencies including fonts for PDF generation
RUN apt-get update && apt-get install -y \
    gcc \
    python3 \
    python3-pip \
    postgresql-client \
    fonts-dejavu \
    fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install Python dependencies
COPY backend/requirements.txt .
RUN python3 -m pip install --no-cache-dir --break-system-packages -r requirements.txt

# Copy application code
COPY backend/ .
COPY --from=frontend-builder /frontend/public ./frontend/public
COPY --from=frontend-builder /frontend/.next/standalone ./frontend
COPY --from=frontend-builder /frontend/.next/static ./frontend/.next/static

# Create storage directory
RUN mkdir -p /app/storage

EXPOSE 8000

CMD ["sh", "scripts/start_with_frontend.sh"]
