/**
 * 用户 Google Ads OAuth API
 * GET: 生成用户 OAuth 授权 URL
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { GoogleAdsMCCService } from '@/lib/google-ads-mcc-service';
import { getCurrentUser } from '@/lib/auth';

const mccService = new GoogleAdsMCCService(getDb());

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const redirectUri = process.env.GOOGLE_ADS_OAUTH_REDIRECT_URI;
    if (!redirectUri) {
      return NextResponse.json(
        { error: 'GOOGLE_ADS_OAUTH_REDIRECT_URI 未配置' },
        { status: 500 }
      );
    }

    const authUrl = mccService.generateUserOAuthUrl(user.id, redirectUri);
    
    return NextResponse.json({ authUrl });
  } catch (error) {
    console.error('Error generating OAuth URL:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate OAuth URL' },
      { status: 500 }
    );
  }
}
