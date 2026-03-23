/**
 * 用户 Google Ads OAuth 回调处理
 * 处理用户完成 OAuth 授权后的回调
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

    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    if (error) {
      return NextResponse.redirect(
        new URL('/google-ads/authorize?error=' + encodeURIComponent(error), request.url)
      );
    }

    if (!code || !state) {
      return NextResponse.json(
        { error: 'Missing code or state' },
        { status: 400 }
      );
    }

    const redirectUri = process.env.GOOGLE_ADS_OAUTH_REDIRECT_URI;
    if (!redirectUri) {
      return NextResponse.json(
        { error: 'GOOGLE_ADS_OAUTH_REDIRECT_URI 未配置' },
        { status: 500 }
      );
    }
    
    await mccService.handleUserOAuthCallback(user.id, code, state, redirectUri);

    // 授权成功，重定向到广告管理页面
    return NextResponse.redirect(
      new URL('/google-ads/campaigns?authorized=1', request.url)
    );
  } catch (error) {
    console.error('Error handling user OAuth callback:', error);
    return NextResponse.redirect(
      new URL('/google-ads/authorize?error=' + encodeURIComponent(
        error instanceof Error ? error.message : 'Authorization failed'
      ), request.url)
    );
  }
}
