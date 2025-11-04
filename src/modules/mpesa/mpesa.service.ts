// src/modules/mpesa/mpesa.service.ts
import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import axios from 'axios';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MpesaService {
  private logger = new Logger(MpesaService.name);
  private token: { value: string; expiresAt: number } | null = null;

  constructor(private config: ConfigService) {}

  private baseUrl() {
    return this.config.get('MPESA_BASE_URL')!;
  }

  // obtain oauth token and cache it
  async getAccessToken(): Promise<string> {
    if (this.token && Date.now() < this.token.expiresAt - 30_000) {
      return this.token.value;
    }
    const key = this.config.get('MPESA_CONSUMER_KEY')!;
    const secret = this.config.get('MPESA_CONSUMER_SECRET')!;
    const url = `${this.baseUrl()}/oauth/v1/generate?grant_type=client_credentials`;
    const encoded = Buffer.from(`${key}:${secret}`).toString('base64');

    const res = await axios.get(url, { headers: { Authorization: `Basic ${encoded}` } });
    const { access_token, expires_in } = res.data;
    this.token = { value: access_token, expiresAt: Date.now() + (Number(expires_in) * 1000) };
    return access_token;
  }

  // create the password: base64(shortcode + passkey + timestamp)
  private makePassword(shortcode: string, passkey: string, timestamp: string) {
    return Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64');
  }

  // create STK push (processrequest)
  async createStkPush({
    amount,
    phone,
    accountReference,
    transactionDesc,
    callbackUrl,
  }: {
    amount: number;
    phone: string; // +254...
    accountReference: string;
    transactionDesc: string;
    callbackUrl: string;
  }) {
    const token = await this.getAccessToken();
    const shortcode = this.config.get('MPESA_SHORTCODE')!;
    const passkey = this.config.get('MPESA_PASSKEY')!;
    const timestamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0,14); // yyyyMMddHHmmss
    const password = this.makePassword(shortcode, passkey, timestamp);

    const body = {
      BusinessShortCode: shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: Math.round(amount), // integer KES
      PartyA: phone,              // msisdn e.g. +2547...
      PartyB: shortcode,
      PhoneNumber: phone,
      CallBackURL: callbackUrl,
      AccountReference: accountReference,
      TransactionDesc: transactionDesc,
    };

    try {
      const res = await axios.post(
        `${this.baseUrl()}/mpesa/stkpush/v1/processrequest`,
        body,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      return res.data;
    } catch (err: any) {
     const daraja = err?.response?.data;
  this.logger.error('STK push error', daraja ?? err?.message ?? err);
  const darajaMsg = daraja?.errorMessage ?? daraja?.errorMessage ?? daraja?.message ?? err?.message;
  throw new InternalServerErrorException(`Failed to initiate STK push: ${darajaMsg ?? 'unknown error'}`);
    }
  }

  // STK push query to verify checkoutRequestID (recommended before marking money received)
  async queryStkPush(checkoutRequestId: string) {
    const token = await this.getAccessToken();
    const shortcode = this.config.get('MPESA_SHORTCODE')!;
    const passkey = this.config.get('MPESA_PASSKEY')!;
    const timestamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0,14);
    const password = this.makePassword(shortcode, passkey, timestamp);

    const body = {
      BusinessShortCode: shortcode,
      Password: password,
      Timestamp: timestamp,
      CheckoutRequestID: checkoutRequestId,
    };

    try {
      const res = await axios.post(
        `${this.baseUrl()}/mpesa/stkpushquery/v1/query`,
        body,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      return res.data;
    } catch (err: any) {
      this.logger.error('STK query error', err?.response?.data ?? err?.message ?? err);
      throw new InternalServerErrorException('Failed to query STK push');
    }
  }
}
