import os
from google import genai
from google.genai import types

from app.config import settings


class GeminiClient:
    def __init__(self):
        self._client = None
        self.model_name = settings.GEMINI_MODEL

    @property
    def client(self):
        # Prefer Vertex AI with ADC for GCP/Cloud Run deployments.
        # Fall back to API-key mode only for non-GCP local experiments.
        if self._client is None:
            if settings.PROJECT_ID:
                self._client = genai.Client(
                    vertexai=True,
                    project=settings.PROJECT_ID,
                    location=settings.REGION,
                )
            else:
                self._client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"))
        return self._client

    def generate_text(self, prompt: str, temperature: float = 0.2) -> str:
        """Generate text using Gemini."""
        try:
            response = self.client.models.generate_content(
                model=self.model_name,
                contents=prompt,
                config=types.GenerateContentConfig(
                    temperature=temperature,
                )
            )
            return response.text
        except Exception as e:
            print(f"Error calling Gemini: {e}")
            raise

gemini_client = GeminiClient()
