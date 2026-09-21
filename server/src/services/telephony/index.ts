import type { CallStatus } from "../../db/schema";
import { getEnv } from "../../config/env";
import { exotelProvider } from "./exotel";

export interface ConnectParams {
  /** Called first (Channel Partner). */
  firstNumber: string;
  /** Bridged second (Developer). */
  secondNumber: string;
  /** Virtual number both parties see — real numbers stay hidden. */
  callerId: string;
  /** Provider status/recording webhook URL. */
  statusCallbackUrl: string;
  record: boolean;
}

export interface ConnectResult {
  providerCallId: string | null;
  status: CallStatus;
  virtualNumber: string | null;
}

export interface WebhookUpdate {
  providerCallId: string | null;
  status?: CallStatus;
  durationSec?: number | null;
  recordingUrl?: string | null;
  recordingId?: string | null;
  startedAt?: Date | null;
  endedAt?: Date | null;
}

/**
 * A telephony/CPaaS provider. Keep this interface stable so the provider can be
 * swapped (Exotel → Twilio/Knowlarity/Kaleyra) without touching call routes.
 */
export interface TelephonyProvider {
  name: string;
  isConfigured(): boolean;
  /** Place a masked, bridged call. Never returns either party's real number. */
  connect(params: ConnectParams): Promise<ConnectResult>;
  /** Normalise a provider status/recording webhook into a WebhookUpdate. */
  parseWebhook(body: Record<string, any>): WebhookUpdate;
}

/** The provider selected by TELEPHONY_PROVIDER (default: exotel). */
export function getTelephonyProvider(): TelephonyProvider {
  const name = getEnv().telephony.provider;
  switch (name) {
    case "exotel":
    default:
      return exotelProvider;
  }
}
