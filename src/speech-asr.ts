import { PassThrough } from 'node:stream';
import * as sdk from 'microsoft-cognitiveservices-speech-sdk';

/**
 * Processes raw audio chunks from SBC VoiceAI WebSocket using Azure Speech SDK
 * and calls back with the recognized text.
 */
export class VoiceAiAsrProcessor {
  private recognizer: sdk.SpeechRecognizer | null = null;
  private pushStream: sdk.PushAudioInputStream | null = null;
  private sessionId: string;
  private onRecognized: (text: string) => void;
  private onError: (err: Error) => void;

  constructor(
    sessionId: string,
    speechKey: string,
    speechRegion: string,
    onRecognized: (text: string) => void,
    onError: (err: Error) => void,
  ) {
    this.sessionId = sessionId;
    this.onRecognized = onRecognized;
    this.onError = onError;

    if (!speechKey || !speechRegion) {
      console.warn(`[asr] Speech credentials not configured for session ${sessionId}`);
      return;
    }

    try {
      // Create push stream for real-time audio
      const inputFormat = sdk.AudioStreamFormat.getWaveFormatPCM(8000, 16, 1);
      this.pushStream = sdk.AudioInputStream.createPushStream(inputFormat);

      const audioConfig = sdk.AudioConfig.fromStreamInput(this.pushStream);
      const speechConfig = sdk.SpeechConfig.fromSubscription(speechKey, speechRegion);
      speechConfig.speechRecognitionLanguage = 'th-TH';

      this.recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);

      // Handle recognized speech
      this.recognizer.recognized = (_, e) => {
        if (e.result.reason === sdk.ResultReason.RecognizedSpeech) {
          const text = e.result.text;
          console.log(`[asr] Recognized: "${text}"`);
          onRecognized(text);
        }
      };

      this.recognizer.canceled = (_, e) => {
        console.error(`[asr] Canceled: ${e.errorDetails}`);
        onError(new Error(e.errorDetails));
      };

      this.recognizer.sessionStopped = () => {
        console.log('[asr] Session stopped');
      };

      // Start continuous recognition
      this.recognizer.startContinuousRecognitionAsync();
      console.log(`[asr] Started continuous recognition for session ${sessionId}`);
    } catch (err) {
      console.error('[asr] Failed to initialize recognizer:', err);
      onError(err instanceof Error ? err : new Error(String(err)));
    }
  }

  /**
   * Feed audio chunk to the ASR engine.
   */
  feedAudio(chunk: Buffer): void {
    if (this.pushStream) {
      const copy = Uint8Array.from(chunk).buffer;
      this.pushStream.write(copy);
    }
  }

  /**
   * Stop recognition and clean up.
   */
  stop(): void {
    if (this.recognizer) {
      try {
        this.recognizer.stopContinuousRecognitionAsync();
      } catch { /* ignore */ }
      this.recognizer.close();
      this.recognizer = null;
    }
    if (this.pushStream) {
      this.pushStream.close();
      this.pushStream = null;
    }
  }
}