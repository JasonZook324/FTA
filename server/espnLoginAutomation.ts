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

      // Wait for the page to load and look for email input directly
      console.log('Looking for email input field...');
      await this.page.waitForSelector('input[type="email"], input[name="email"], #email', { timeout: 15000 });

      // Enter email address directly
      console.log('Entering email address...');
      const emailInput = await this.page.locator('input[type="email"], input[name="email"], #email').first();
      await emailInput.fill(email);

      // Look for and click the login/continue button
      console.log('Looking for login button...');
      const loginButton = this.page.locator('button:has-text("Log In"), button:has-text("Continue"), button:has-text("Sign In"), button[type="submit"]').first();
      await loginButton.click();

      // Wait for either MFA page or potential error message
      console.log('Waiting for next step...');
      try {
        // Wait for MFA input or password field
        await this.page.waitForSelector('input[type="password"], input[placeholder*="code"], input[placeholder*="Code"], input[placeholder*="verification"]', { timeout: 15000 });
        
        // Check if we got a password field (means we need to handle password login flow)
        const passwordField = await this.page.locator('input[type="password"]').first();
        if (await passwordField.isVisible()) {
          return { 
            success: false, 
            waitingForMFA: false, 
            error: 'Password required. Please use manual login or ensure your ESPN account is configured for passwordless login.' 
          };
        }

        // If we reach here, we should have MFA input
        console.log('MFA page loaded. Waiting for user to enter verification code...');
        return { success: true, waitingForMFA: true };

      } catch (waitError) {
        // Try to find any error messages on the page
        const errorMessage = await this.page.locator('text*="error", text*="invalid", text*="incorrect"').first().textContent();
        if (errorMessage) {
          return { 
            success: false, 
            waitingForMFA: false, 
            error: `Login failed: ${errorMessage}` 
          };
        }
        throw waitError;
      }

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
      const codeInput = await this.page.locator('input[type="text"], input[placeholder*="code"], input[placeholder*="Code"], input[placeholder*="verification"]').first();
      await codeInput.fill(verificationCode);

      // Click submit/continue button for MFA
      console.log('Submitting verification code...');
      const submitButton = this.page.locator('button:has-text("Continue"), button:has-text("Submit"), button:has-text("Verify"), button:has-text("Log In"), button[type="submit"]').first();
      await submitButton.click();

      // Wait for navigation or success indication
      console.log('Waiting for login completion...');
      try {
        // Wait for either success indicators or homepage
        await this.page.waitForURL('**/homepage', { timeout: 30000 });
      } catch {
        // If URL doesn't change, look for success elements
        await this.page.waitForSelector('text*="Welcome", [data-testid="user-menu"], .user-menu, text*="My Account"', { timeout: 30000 });
      }

      // Click Done if present
      try {
        await this.page.click('button:has-text("Done"), button:has-text("Close")', { timeout: 3000 });
        console.log('Clicked Done/Close button');
      } catch {
        console.log('No Done/Close button found, continuing...');
      }

      // Navigate to ESPN fantasy to ensure cookies are set properly
      console.log('Navigating to ESPN fantasy to verify cookies...');
      await this.page.goto('https://fantasy.espn.com', { waitUntil: 'networkidle' });
      
      // Wait a moment for cookies to be set
      await this.page.waitForTimeout(3000);

      // Extract cookies
      console.log('Extracting authentication cookies...');
      const cookies = await this.context!.cookies();
      
      const espnS2Cookie = cookies.find(cookie => cookie.name === 'espn_s2');
      const swidCookie = cookies.find(cookie => cookie.name === 'SWID');

      console.log('Found cookies:', { 
        espnS2Found: !!espnS2Cookie, 
        swidFound: !!swidCookie,
        allCookieNames: cookies.map(c => c.name)
      });

      if (!espnS2Cookie || !swidCookie) {
        return { 
          success: false, 
          error: 'Authentication cookies not found. Login may have failed or cookies not set properly.' 
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