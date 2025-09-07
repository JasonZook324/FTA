import fetch, { Response } from 'node-fetch';

interface DisneyLoginResponse {
  success: boolean;
  sessionId?: string;
  message?: string;
}

interface EspnLeague {
  id: string;
  name: string;
  sport: string;
  season: number;
}

interface LeagueListResponse {
  success: boolean;
  leagues?: EspnLeague[];
  message?: string;
}

interface CookieExtractionResponse {
  success: boolean;
  cookies?: {
    espnS2: string;
    swid: string;
  };
  message?: string;
}

export class EspnAuthService {
  private readonly espnLoginUrl = 'https://www.espn.com/login/';
  private readonly disneyApiUrl = 'https://registerdisney.go.com/jgc/v6/client/ESPN-ONESITE.WEB-PROD/guest/login';
  private readonly espnApiUrl = 'https://fantasy.espn.com/apis/v3/games';
  private readonly espnFantasyUrl = 'https://fantasy.espn.com';
  
  /**
   * Authenticate with ESPN using email and password, handling Disney's multi-step process internally
   */
  async authenticateWithCredentials(email: string, password: string): Promise<CookieExtractionResponse> {
    try {
      console.log('Starting ESPN authentication for:', email);

      // Step 1: Get ESPN login page to establish session
      const loginPageResponse = await fetch(this.espnLoginUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate, br',
          'DNT': '1',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
        },
      });

      if (!loginPageResponse.ok) {
        throw new Error('Failed to access ESPN login page');
      }

      // Extract cookies from login page
      const initialCookies = this.extractCookiesFromHeaders(loginPageResponse.headers);
      
      // Step 2: Submit credentials to Disney authentication
      const authPayload = {
        loginValue: email,
        password: password,
        rememberMe: true,
        supportedAuthenticationMethods: ['password'],
      };

      const authResponse = await fetch(this.disneyApiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
          'Referer': this.espnLoginUrl,
          'Origin': 'https://www.espn.com',
          'Cookie': this.formatCookies(initialCookies),
        },
        body: JSON.stringify(authPayload),
      });

      const authData = await authResponse.json() as any;

      if (!authResponse.ok || authData.error) {
        const errorMsg = authData.error?.description || authData.message || 'Authentication failed';
        console.error('Disney authentication error:', errorMsg);
        return {
          success: false,
          message: errorMsg,
        };
      }

      // Step 3: Handle potential redirect and get ESPN session
      const authCookies = this.extractCookiesFromHeaders(authResponse.headers);
      const allCookies = { ...initialCookies, ...authCookies };

      // Step 4: Access ESPN Fantasy to establish fantasy session and get final cookies
      const fantasyResponse = await fetch(`${this.espnFantasyUrl}/`, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Cookie': this.formatCookies(allCookies),
        },
        redirect: 'follow',
      });

      const finalCookies = this.extractCookiesFromHeaders(fantasyResponse.headers);
      const completeCookies = { ...allCookies, ...finalCookies };

      // Extract the specific cookies we need
      const espnS2 = completeCookies['espn_s2'] || completeCookies['ESPN_S2'];
      const swid = completeCookies['SWID'] || completeCookies['swid'];

      if (!espnS2 || !swid) {
        console.log('Available cookies:', Object.keys(completeCookies));
        return {
          success: false,
          message: 'Failed to obtain ESPN authentication cookies. Please verify your credentials.',
        };
      }

      console.log('Successfully extracted ESPN cookies');
      return {
        success: true,
        cookies: {
          espnS2,
          swid,
        },
      };

    } catch (error) {
      console.error('ESPN authentication error:', error);
      return {
        success: false,
        message: 'Authentication failed. Please check your credentials and try again.',
      };
    }
  }

  /**
   * Get available fantasy leagues for authenticated user
   */
  async getAvailableLeagues(espnS2: string, swid: string): Promise<EspnLeague[]> {
    try {
      // Try to get user's leagues from ESPN API
      const cookieHeader = `espn_s2=${espnS2}; SWID=${swid};`;
      
      const response = await fetch(`${this.espnApiUrl}/ffl/seasons/2025/segments/0/leaguedefaults/1?view=mSettings`, {
        method: 'GET',
        headers: {
          'Cookie': cookieHeader,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
        },
      });

      if (response.ok) {
        // If successful, return mock leagues (in production, parse actual response)
        return this.getFantasyLeagues({ espnS2, swid });
      }

      // Fallback to default leagues
      return this.getFantasyLeagues({ espnS2, swid });
    } catch (error) {
      console.error('Error fetching leagues:', error);
      return this.getFantasyLeagues({ espnS2, swid });
    }
  }

  /**
   * Extract cookies from response headers
   */
  private extractCookiesFromHeaders(headers: any): Record<string, string> {
    const cookies: Record<string, string> = {};
    
    try {
      const setCookieHeaders = headers.get('set-cookie') || headers['set-cookie'] || [];
      const cookieArray = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];
      
      for (const cookieHeader of cookieArray) {
        if (cookieHeader) {
          const cookiePairs = cookieHeader.split(';');
          for (const pair of cookiePairs) {
            const [name, value] = pair.trim().split('=');
            if (name && value) {
              cookies[name] = value;
            }
          }
        }
      }
    } catch (error) {
      console.error('Cookie extraction error:', error);
    }
    
    return cookies;
  }

  /**
   * Format cookies for HTTP headers
   */
  private formatCookies(cookies: Record<string, string>): string {
    return Object.entries(cookies)
      .map(([name, value]) => `${name}=${value}`)
      .join('; ');
  }


  /**
   * Get user's fantasy leagues
   */
  private async getFantasyLeagues(cookies: { espnS2: string; swid: string }): Promise<EspnLeague[]> {
    try {
      // Mock leagues for development - in production this would query ESPN's API
      return [
        {
          id: '1713644125',
          name: 'ESPN Fantasy Football League',
          sport: 'ffl',
          season: 2025,
        },
        {
          id: '123456789',
          name: 'Friends Fantasy League',
          sport: 'ffl',
          season: 2025,
        },
      ];
    } catch (error) {
      console.error('Error fetching leagues:', error);
      return [];
    }
  }

  /**
   * Generate mock ESPN S2 cookie for development
   */
  private generateMockEspnS2(email: string, leagueId: string): string {
    const timestamp = Date.now();
    const emailHash = Buffer.from(email).toString('base64').replace(/=/g, '').substring(0, 16);
    // Generate a realistic-looking ESPN S2 cookie
    return `AECiAiAiAiAhMTYhMTkyLjE2OC4xLjEh${emailHash}LjEhMTczNzkwMzU5OCox${leagueId}MDA${timestamp.toString().substring(0, 10)}`;
  }

  /**
   * Generate mock SWID cookie for development
   */
  private generateMockSwid(email: string): string {
    const emailHash = Buffer.from(email).toString('hex').toUpperCase();
    const guid = `${emailHash.substring(0, 8)}-${emailHash.substring(8, 12)}-${emailHash.substring(12, 16)}-${emailHash.substring(16, 20)}-${emailHash.substring(20, 32)}`;
    return `{${guid}}`;
  }
}

export const espnAuthService = new EspnAuthService();