const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: corsHeaders,
      body: "",
    };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  try {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is not configured in Netlify.");
    }

    const body = JSON.parse(event.body || "{}");
    const image = body.image;
    const modification = body.modification || "S3 Front Bumper";

    if (!image) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          error: "No image provided.",
        }),
      };
    }

    const match = image.match(
      /^data:(image\/(?:png|jpeg|jpg|webp));base64,(.+)$/
    );

    if (!match) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          error: "Image must be PNG, JPEG or WebP.",
        }),
      };
    }

    const mimeType =
      match[1] === "image/jpg" ? "image/jpeg" : match[1];

    const base64Data = match[2];

    // Protect the OpenAI request from oversized images.
    // The frontend already compresses the photo, but this is
    // an additional server-side safety check.
    if (base64Data.length > 1800000) {
      return {
        statusCode: 413,
        headers: corsHeaders,
        body: JSON.stringify({
          error:
            "The uploaded photo is still too large. Please choose another photo.",
        }),
      };
    }

    const binary = Buffer.from(base64Data, "base64");

    const form = new FormData();

    form.append("model", "gpt-image-2");

    form.append(
      "prompt",
      `Edit this exact uploaded car photo.

Keep the exact same Audi A3 8P Sportback.

Keep:
- the same car
- the same body proportions
- the same paint color
- the same wheels
- the same headlights
- the same background
- the same camera angle
- the same lighting
- the same perspective

ONLY apply this modification:

${modification}

Install the S3 Front Bumper realistically on the original car.

The bumper must look like a real OEM-quality Audi S3 8P bumper physically installed on the car.

Do not redesign the vehicle.
Do not change the wheels.
Do not change the color.
Do not change the background.
Do not change the camera angle.
Do not add other modifications.

Photorealistic automotive photography.`
    );

    form.append(
      "image",
      new Blob([binary], { type: mimeType }),
      mimeType === "image/png" ? "car.png" : "car.jpg"
    );

    form.append("n", "1");
    form.append("size", "auto");
    form.append("quality", "auto");
    form.append("output_format", "jpeg");

    const response = await fetch(
      "https://api.openai.com/v1/images/edits",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body: form,
      }
    );

    const result = await response.json();

    if (!response.ok) {
      console.error("OpenAI error:", result);

      return {
        statusCode: response.status,
        headers: corsHeaders,
        body: JSON.stringify({
          error:
            result?.error?.message ||
            "OpenAI image generation failed.",
        }),
      };
    }

    const generated = result?.data?.[0]?.b64_json;

    if (!generated) {
      throw new Error("OpenAI returned no generated image.");
    }

    return {
      statusCode: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        image: `data:image/jpeg;base64,${generated}`,
      }),
    };
  } catch (error) {
    console.error("CarForge generation error:", error);

    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        error: error.message || "Generation failed.",
      }),
    };
  }
};
