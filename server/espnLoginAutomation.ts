import { chromium, Browser, Page, BrowserContext } from 'playwright';

export interface ESPNCredentials {
  espnS2: string;
  swid: string;
}

export interface LoginAutomationOptions {
  email: string;
  headless?: boolean;
  timeout?: number;
}

export class ESPNLoginAutomation {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;

  async initialize(headless: boolean = true): Promise<void> {
    this.browser = await chromium.launch({ 
      headless,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
      executablePath: process.env.CHROMIUM_PATH || undefined
    });
    this.context = await this.browser.newContext({
      viewport: { width: 1280, height: 720 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    });
    this.page = await this.context.newPage();
  }

  async startLogin(email: string): Promise<{ success: boolean; waitingForMFA: boolean; error?: string }> {
    if (!this.page) {
      throw new Error('Browser not initialized. Call initialize() first.');
    }

    try {
      console.log('Navigating to ESPN login page...');
      await this.page.goto('https://www.espn.com/login', { waitUntil: 'networkidle' });

      // Wait for and click "Need help logging in?" link
      console.log('Looking for "Need help logging in?" link...');
      await this.page.waitForSelector('text=Need help logging in?', { timeout: 10000 });
      await this.page.click('text=Need help logging in?');

      // Wait for modal to appear
      console.log('Waiting for modal to appear...');
      await this.page.waitForSelector('[data-testid="email-input"], input[type="email"]', { timeout: 10000 });

      // Enter email address
      console.log('Entering email address...');
      const emailInput = await this.page.locator('[data-testid="email-input"], input[type="email"]').first();
      await emailInput.fill(email);

      // Click Continue button
      console.log('Clicking Continue button...');
      await this.page.click('button:has-text("Continue"), [data-testid="continue-button"]');

      // Wait for MFA page to load
      console.log('Waiting for MFA page...');
      await this.page.waitForSelector('input[type="text"], input[placeholder*="code"], input[placeholder*="Code"]', { timeout: 15000 });

      console.log('MFA page loaded. Waiting for user to enter verification code...');
      return { success: true, waitingForMFA: true };

    } catch (error) {
      console.error('Error during login automation:', error);
      return { 
        success: false, 
        waitingForMFA: false, 
        error: error instanceof Error ? error.message : 'Unknown error during login'
      };
    }
  }

  async completeMFA(verificationCode: string): Promise<{ success: boolean; credentials?: ESPNCredentials; error?: string }> {
    if (!this.page) {
      throw new Error('Browser not initialized or login not started.');
    }

    try {
      console.log('Entering MFA verification code...');
      const codeInput = await this.page.locator('input[type="text"], input[placeholder*="code"], input[placeholder*="Code"]').first();
      await codeInput.fill(verificationCode);

      // Click submit/continue button for MFA
      console.log('Submitting verification code...');
      await this.page.click('button:has-text("Continue"), button:has-text("Submit"), button:has-text("Verify")');

      // Wait for successful login - look for welcome message or profile elements
      console.log('Waiting for successful login...');
      await this.page.waitForSelector('text=Welcome back, button:has-text("Done"), [data-testid="success"]', { timeout: 30000 });

      // Click Done if present
      try {
        await this.page.click('button:has-text("Done")', { timeout: 5000 });
        console.log('Clicked Done button');
      } catch {
        console.log('No Done button found, continuing...');
      }

      // Wait a moment for cookies to be set
      await this.page.waitForTimeout(2000);

      // Extract cookies
      console.log('Extracting authentication cookies...');
      const cookies = await this.context!.cookies();
      
      const espnS2Cookie = cookies.find(cookie => cookie.name === 'espn_s2');
      const swidCookie = cookies.find(cookie => cookie.name === 'SWID');

      if (!espnS2Cookie || !swidCookie) {
        console.error('Required cookies not found:', { 
          espnS2Found: !!espnS2Cookie, 
          swidFound: !!swidCookie,
          allCookies: cookies.map(c => c.name)
        });
        return { 
          success: false, 
          error: 'Authentication cookies not found. Login may have failed.' 
        };
      }

      const credentials: ESPNCredentials = {
        espnS2: espnS2Cookie.value,
        swid: swidCookie.value
      };

      console.log('Successfully extracted ESPN credentials');
      return { success: true, credentials };

    } catch (error) {
      console.error('Error during MFA completion:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error during MFA completion'
      };
    }
  }

  async cleanup(): Promise<void> {
    try {
      if (this.page) {
        await this.page.close();
        this.page = null;
      }
      if (this.context) {
        await this.context.close();
        this.context = null;
      }
      if (this.browser) {
        await this.browser.close();
        this.browser = null;
      }
    } catch (error) {
      console.error('Error during cleanup:', error);
    }
  }

  // Utility method for full automated login (for testing purposes)
  async automateLogin(options: LoginAutomationOptions): Promise<{ success: boolean; credentials?: ESPNCredentials; error?: string }> {
    try {
      await this.initialize(options.headless ?? true);
      
      const loginResult = await this.startLogin(options.email);
      if (!loginResult.success || !loginResult.waitingForMFA) {
        return { success: false, error: loginResult.error || 'Failed to start login process' };
      }

      // In a real scenario, this would wait for user input
      // For now, we'll return a state indicating MFA is needed
      return { 
        success: false, 
        error: 'MFA verification required. Please use the web interface to complete login.' 
      };

    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error during automation'
      };
    } finally {
      await this.cleanup();
    }
  }
}

// Export singleton instance for use across the application
export const espnLoginAutomation = new ESPNLoginAutomation();