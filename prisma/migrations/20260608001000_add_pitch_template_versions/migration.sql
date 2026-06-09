-- CreateTable
CREATE TABLE "pitch_template_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "pitch_template_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "content" TEXT NOT NULL,
    "tone" VARCHAR(50) NOT NULL DEFAULT 'formal',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pitch_template_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pitch_template_versions_pitch_template_id_idx" ON "pitch_template_versions"("pitch_template_id");

-- AddForeignKey
ALTER TABLE "pitch_template_versions" ADD CONSTRAINT "pitch_template_versions_pitch_template_id_fkey" FOREIGN KEY ("pitch_template_id") REFERENCES "pitch_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
