FROM python:3.13-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
RUN apt-get update && apt-get install -y --no-install-recommends postgresql-client && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
RUN useradd --system --uid 1001 sgi && mkdir -p /var/lib/sgi/media && chown sgi /var/lib/sgi/media
USER sgi
RUN DJANGO_SECRET_KEY=build python manage.py collectstatic --noinput
EXPOSE 8000
CMD ["gunicorn", "config.wsgi", "-b", "0.0.0.0:8000", "-w", "3", "--access-logfile", "-"]
