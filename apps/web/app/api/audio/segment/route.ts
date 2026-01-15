import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFile, unlink, mkdtemp } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

const execAsync = promisify(exec);

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  let tempDir: string | null = null;
  let inputPath: string | null = null;
  let outputPath: string | null = null;

  try {
    // Get form data
    const formData = await request.formData();
    const audioFile = formData.get('audio') as File;
    const startTime = parseFloat(formData.get('startTime') as string);
    const endTime = parseFloat(formData.get('endTime') as string);

    if (!audioFile) {
      return NextResponse.json(
        { error: 'No audio file provided' },
        { status: 400 }
      );
    }

    if (isNaN(startTime) || isNaN(endTime) || startTime < 0 || endTime <= startTime) {
      return NextResponse.json(
        { error: 'Invalid time range' },
        { status: 400 }
      );
    }

    // Create temporary directory
    tempDir = await mkdtemp(join(tmpdir(), 'audio-segment-'));
    inputPath = join(tempDir, `input.${audioFile.name.split('.').pop() || 'mp3'}`);
    outputPath = join(tempDir, 'output.mp3');

    // Write uploaded file to temp directory
    const audioBuffer = await audioFile.arrayBuffer();
    await writeFile(inputPath, Buffer.from(audioBuffer));

    // Use FFmpeg to extract segment
    // ffmpeg -i input.mp3 -ss startTime -t duration -acodec copy output.mp3
    const duration = endTime - startTime;
    const ffmpegCommand = `ffmpeg -i "${inputPath}" -ss ${startTime} -t ${duration} -acodec copy "${outputPath}" -y`;

    try {
      await execAsync(ffmpegCommand);
    } catch (error) {
      // If FFmpeg fails, try with re-encoding (slower but more compatible)
      const ffmpegCommandReencode = `ffmpeg -i "${inputPath}" -ss ${startTime} -t ${duration} "${outputPath}" -y`;
      await execAsync(ffmpegCommandReencode);
    }

    // Read the output file
    const fs = await import('fs/promises');
    const outputBuffer = await fs.readFile(outputPath);

    // Clean up temp files
    try {
      if (inputPath) await unlink(inputPath);
      if (outputPath) await unlink(outputPath);
      if (tempDir) await fs.rmdir(tempDir);
    } catch (cleanupError) {
      console.warn('Failed to clean up temp files:', cleanupError);
    }

    // Return the audio segment
    return new NextResponse(outputBuffer, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Disposition': `attachment; filename="segment.mp3"`,
      },
    });
  } catch (error) {
    // Clean up on error
    if (inputPath) {
      try {
        await unlink(inputPath);
      } catch {}
    }
    if (outputPath) {
      try {
        await unlink(outputPath);
      } catch {}
    }
    if (tempDir) {
      try {
        const fs = await import('fs/promises');
        await fs.rmdir(tempDir);
      } catch {}
    }

    console.error('Audio segmentation error:', error);
    return NextResponse.json(
      { error: 'Failed to segment audio. Make sure FFmpeg is installed and available in PATH.' },
      { status: 500 }
    );
  }
}
