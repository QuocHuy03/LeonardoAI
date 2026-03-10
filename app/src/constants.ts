// Models and size constants shared between frontend components
export type RefType = 'IMAGE_REF' | 'STYLE_CONTENT_REF' | 'IMAGE_GUIDANCE' | 'NONE'

export interface ModelConfig {
  name: string
  modelId: string
  apiType: 'NEW' | 'LEGACY'
  core: string
  description: string
  refType: RefType
}

export const MODELS: ModelConfig[] = [
  // GEMINI (new Generate API) — support Image Ref
  { name: 'Nano Banana 2',         modelId: '7418e71f-4133-4e1b-9895-bee19f48f2ce', apiType: 'NEW',    core: 'GEMINI',   description: 'Consistency & infographics (Gemini 3.1 Flash)', refType: 'IMAGE_REF' },
  { name: 'Nano Banana Pro',       modelId: '7c02ef35-3a6b-4df6-b78d-873e5032c3b4', apiType: 'NEW',    core: 'GEMINI',   description: 'Consistency (Gemini 3 Pro)',                     refType: 'IMAGE_REF' },
  { name: 'Nano Banana',           modelId: '4a008a65-8d97-44f5-97a0-66c431612614', apiType: 'NEW',    core: 'GEMINI',   description: 'Fast model (Gemini 2.5 Flash)',                  refType: 'IMAGE_REF' },
  // FLUX — varies by sub-type
  { name: 'Lucid Origin',          modelId: '7b592283-e8a7-4c5a-9ba6-d18c31f258b9', apiType: 'LEGACY', core: 'FLUX',     description: 'Vibrant imagery, HD output',                    refType: 'STYLE_CONTENT_REF' },
  { name: 'Lucid Realism',         modelId: '05ce0082-2d80-4a2d-8653-4d1c85e2418e', apiType: 'LEGACY', core: 'FLUX',     description: 'Efficient, quick outputs',                      refType: 'IMAGE_REF' },
  { name: 'Flux Schnell',          modelId: '1dd50843-d653-4516-a8e3-f0238ee453ff', apiType: 'LEGACY', core: 'FLUX',     description: 'High-speed model',                              refType: 'IMAGE_REF' },
  { name: 'Flux Dev',              modelId: 'b2614463-296c-462a-9586-aafdb8f00e36', apiType: 'LEGACY', core: 'FLUX',     description: 'Developer model, rapid prototyping',            refType: 'IMAGE_REF' },
  { name: 'FLUX.1 Kontext',        modelId: '28aeddf8-bd19-4803-80fc-79602d1a9989', apiType: 'LEGACY', core: 'FLUX',     description: 'Controllable generation and editing',           refType: 'IMAGE_REF' },
  { name: 'FLUX.2 Pro',            modelId: '5478273a-68e1-4efe-a0c4-3fe84e4c16a8', apiType: 'LEGACY', core: 'FLUX',     description: 'High-fidelity, advanced prompt adherence',      refType: 'IMAGE_GUIDANCE' },
  // PHOENIX — Image Ref
  { name: 'Phoenix 1.0',           modelId: 'de7d3faf-762f-48e0-b3b7-9d0ac3a3fcf3', apiType: 'LEGACY', core: 'PHOENIX',  description: 'Exceptional prompt adherence',                  refType: 'IMAGE_REF' },
  { name: 'Phoenix 0.9',           modelId: '6b645e3a-d64f-4341-a6d8-7a3690fbf042', apiType: 'LEGACY', core: 'PHOENIX',  description: 'Extreme text rendering',                        refType: 'IMAGE_REF' },
  // SD / SDXL — no reference
  { name: 'Leonardo Lightning XL', modelId: 'b24e16ff-06e3-43eb-8d33-4416c2d75876', apiType: 'LEGACY', core: 'SD',       description: 'High-speed generalist',                         refType: 'NONE' },
  { name: 'Leonardo Anime XL',     modelId: 'e71a1c2f-4f80-4800-934f-2c68979d8cc8', apiType: 'LEGACY', core: 'SD',       description: 'Anime-focused model',                           refType: 'NONE' },
  { name: 'Leonardo Kino XL',      modelId: 'aa77f04e-3eec-4034-9c07-d0f619684628', apiType: 'LEGACY', core: 'SD',       description: 'Cinematic outputs',                             refType: 'NONE' },
  { name: 'Leonardo Diffusion XL', modelId: '1e60896f-3c26-4296-8ecc-53e2afecc132', apiType: 'LEGACY', core: 'SD',       description: 'Stunning outputs',                              refType: 'NONE' },
  { name: 'SDXL 1.0',             modelId: '16e7060a-803e-4df3-97ee-edcfa5dc9cc8', apiType: 'LEGACY', core: 'SD',       description: 'Stable Diffusion XL',                          refType: 'NONE' },
  // OTHER
  { name: 'GPT Image-1',           modelId: 'f75b1998-e5cb-4fdf-9eef-98e8186c2c2f', apiType: 'LEGACY', core: 'OPENAI',   description: 'OpenAI image generation',                       refType: 'IMAGE_REF' },
  { name: 'GPT Image-1.5',         modelId: '99ecc726-3404-412c-9dc1-24d4cdef2299', apiType: 'LEGACY', core: 'OPENAI',   description: 'Superior editing control',                      refType: 'IMAGE_REF' },
  { name: 'Seedream 4',            modelId: '94515e81-e589-4a5b-aeae-10ced50142c2', apiType: 'LEGACY', core: 'SEEDREAM', description: 'Ultra-high quality',                            refType: 'IMAGE_REF' },
  { name: 'Seedream 4.5',          modelId: 'f1c295ea-1575-445f-89ae-9b4013a6a37c', apiType: 'LEGACY', core: 'SEEDREAM', description: 'Ultra-high quality for editing',                refType: 'IMAGE_REF' },
  { name: 'Ideogram 3.0',          modelId: 'f9672904-3313-4867-b883-407ef6a0edec', apiType: 'LEGACY', core: 'IDEOGRAM', description: 'Accurate text rendering',                       refType: 'NONE' },
]

export type AspectRatio = '2:3' | '1:1' | '3:2' | '16:9' | '9:16'

export interface SizeTier { label: string; w: number; h: number }

export const SIZES: Record<AspectRatio, SizeTier[]> = {
  '2:3':  [{ label: 'Small',  w: 848,  h: 1264 }, { label: 'Medium', w: 1344, h: 2016 }],
  '1:1':  [{ label: 'Small',  w: 1024, h: 1024 }, { label: 'Medium', w: 2048, h: 2048 }],
  '3:2':  [{ label: 'Small',  w: 1264, h: 848  }, { label: 'Medium', w: 2016, h: 1344 }],
  '16:9': [{ label: 'Small',  w: 1360, h: 768  }, { label: 'Medium', w: 2720, h: 1532 }],
  '9:16': [{ label: 'Small',  w: 768,  h: 1360 }, { label: 'Medium', w: 1532, h: 2720 }],
}

export const CORE_COLORS: Record<string, string> = {
  GEMINI: '#6366f1', FLUX: '#f59e0b', PHOENIX: '#ef4444',
  SD: '#06b6d4', OPENAI: '#10b981', SEEDREAM: '#a855f7', IDEOGRAM: '#ec4899'
}

export const REF_TYPE_LABELS: Record<RefType, string> = {
  IMAGE_REF:        'Image Ref',
  STYLE_CONTENT_REF:'Style+Content Ref',
  IMAGE_GUIDANCE:   'Image Guidance',
  NONE:             '',
}

export const REF_TYPE_COLORS: Record<RefType, string> = {
  IMAGE_REF:        '#6366f1',
  STYLE_CONTENT_REF:'#f59e0b',
  IMAGE_GUIDANCE:   '#10b981',
  NONE:             '#444',
}
