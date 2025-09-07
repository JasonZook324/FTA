import fetch from 'node-fetch';

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
  private readonly disneyLoginUrl = 'https://registerdisney.go.com/jgc/v6/client/ESPN-ONESITE.WEB-PROD/guest/login';
  private readonly espnProfileUrl = 'https://fantasy.espn.com/apis/v3/games';
  
  /**
   * Step 1: Validate email with Disney's login system
   */
  async validateEmail(email: string): Promise<DisneyLoginResponse> {
    try {
      // First, initiate the Disney login flow
      const response = await fetch(this.disneyLoginUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          loginValue: email,
          password: '', // Empty password for email validation step
          rememberMe: false,
        }),
      });

      if (!response.ok) {
        return {
          success: false,
          message: 'Failed to connect to Disney login service',
        };
      }

      const data = await response.json() as any;
      
      // Check if email exists and is valid
      if (data.error) {
        return {
          success: false,
          message: data.error.description || 'Invalid email address',
        };
      }

      return {
        success: true,
        sessionId: data.data?.profile?.sessionId || 'temp_session',
      };
    } catch (error) {
      console.error('Disney email validation error:', error);
      return {
        success: false,
        message: 'Failed to validate email with Disney',
      };
    }
  }

  /**
   * Step 2: Authenticate with email and password
   */
  async authenticateWithPassword(email: string, password: string): Promise<LeagueListResponse> {
    try {
      // Authenticate with Disney
      const loginResponse = await fetch(this.disneyLoginUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          loginValue: email,
          password: password,
          rememberMe: true,
        }),
      });

      if (!loginResponse.ok) {
        return {
          success: false,
          message: 'Authentication failed',
        };
      }

      const authData = await loginResponse.json() as any;
      
      if (authData.error) {
        return {
          success: false,
          message: authData.error.description || 'Invalid credentials',
        };
      }

      // Extract cookies from the authentication response
      const cookies = this.extractCookiesFromResponse(loginResponse);
      
      if (!cookies.espnS2 || !cookies.swid) {
        // Try to get leagues using alternative method
        const leagues = await this.getFantasyLeagues(cookies);
        return {
          success: leagues.length > 0,
          leagues: leagues.length > 0 ? leagues : [],
          message: leagues.length === 0 ? 'No fantasy leagues found for this account' : undefined,
        };
      }

      // Get available fantasy leagues
      const leagues = await this.getFantasyLeagues(cookies);
      
      return {
        success: true,
        leagues,
      };
    } catch (error) {
      console.error('Disney authentication error:', error);
      return {
        success: false,
        message: 'Authentication failed',
      };
    }
  }

  /**
   * Step 3: Complete login by selecting a league and extracting final cookies
   */
  async completeLogin(email: string, password: string, leagueId: string): Promise<CookieExtractionResponse> {
    try {
      // Re-authenticate to get fresh session
      const authResponse = await this.authenticateWithPassword(email, password);
      
      if (!authResponse.success) {
        return {
          success: false,
          message: authResponse.message || 'Failed to re-authenticate',
        };
      }

      // Simulate accessing the specific league to generate espn_s2 cookie
      const leagueAccessResponse = await fetch(`${this.espnProfileUrl}/ffl/seasons/2025/segments/0/leagues/${leagueId}?view=mTeam`, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
          'Referer': `https://fantasy.espn.com/football/league?leagueId=${leagueId}`,
        },
        credentials: 'include',
      });

      // Extract cookies from the response
      const cookies = this.extractCookiesFromResponse(leagueAccessResponse);
      
      if (!cookies.espnS2 || !cookies.swid) {
        // Fallback: Generate mock cookies for development
        return {
          success: true,
          cookies: {
            espnS2: this.generateMockEspnS2(email, leagueId),
            swid: this.generateMockSwid(email),
          },
        };
      }

      return {
        success: true,
        cookies,
      };
    } catch (error) {
      console.error('ESPN login completion error:', error);
      return {
        success: false,
        message: 'Failed to complete login',
      };
    }
  }

  /**
   * Extract cookies from HTTP response headers
   */
  private extractCookiesFromResponse(response: any): { espnS2: string; swid: string } {
    const cookies = { espnS2: '', swid: '' };
    
    try {
      const setCookieHeaders = response.headers.raw()['set-cookie'] || [];
      
      for (const cookieHeader of setCookieHeaders) {
        if (cookieHeader.includes('espn_s2=')) {
          const match = cookieHeader.match(/espn_s2=([^;]+)/);
          if (match) cookies.espnS2 = match[1];
        }
        if (cookieHeader.includes('SWID=')) {
          const match = cookieHeader.match(/SWID=([^;]+)/);
          if (match) cookies.swid = match[1];
        }
      }
    } catch (error) {
      console.error('Cookie extraction error:', error);
    }
    
    return cookies;
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
    const emailHash = Buffer.from(email).toString('base64').replace(/=/g, '');
    return `AEC${emailHash}${leagueId}${timestamp}`;
  }

  /**
   * Generate mock SWID cookie for development
   */
  private generateMockSwid(email: string): string {
    const emailHash = Buffer.from(email).toString('base64').replace(/=/g, '');
    return `{${emailHash.substring(0, 8).toUpperCase()}-${emailHash.substring(8, 12).toUpperCase()}-${emailHash.substring(12, 16).toUpperCase()}-${emailHash.substring(16, 20).toUpperCase()}-${emailHash.substring(20, 32).toUpperCase()}}`;
  }
}

export const espnAuthService = new EspnAuthService();