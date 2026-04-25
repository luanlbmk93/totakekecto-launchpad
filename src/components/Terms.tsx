import React from 'react';
import { FileText, AlertTriangle, Shield } from 'lucide-react';

export const Terms: React.FC = () => {
  return (
    <div className="max-w-4xl mx-auto">
      <div className="text-center mb-12">
        <div className="flex justify-center mb-6">
          <div className="bg-vault-primary p-4 rounded-2xl">
            <FileText className="h-8 w-8 text-black" />
          </div>
        </div>
        <h1 className="text-4xl font-magistral font-bold text-white mb-4">
          Terms of Use
        </h1>
        <p className="text-xl text-gray-400">
          Last updated: October 2025
        </p>
      </div>

      <div className="space-y-8">
        {/* Important Notice */}
        <div className="bg-yellow-900/30 border border-yellow-700 rounded-2xl p-6">
          <div className="flex items-center space-x-3 mb-4">
            <AlertTriangle className="h-6 w-6 text-yellow-400" />
            <h2 className="text-xl font-bold text-yellow-400">Important Notice</h2>
          </div>
          <p className="text-gray-300 leading-relaxed">
            Tota Vault operates on the BNB Smart Chain (BSC). Interacting with decentralized
            applications and smart contracts involves financial risk. Always verify contract
            addresses and conduct your own research before participating.
          </p>
        </div>

        {/* Terms Sections */}
        <div className="space-y-6">
          <section className="bg-zinc-900 rounded-2xl p-6 border border-zinc-700">
            <h2 className="text-2xl font-bold text-vault-primary mb-4">1. Acceptance of Terms</h2>
            <p className="text-gray-300 leading-relaxed mb-4">
              By accessing and using the Tota Vault platform, you agree to comply with these terms 
              and conditions. If you do not agree with any part of these terms, you should not 
              use our services.
            </p>
            <p className="text-gray-300 leading-relaxed">
              These terms constitute a legal agreement between you and Tota Vault. 
              We reserve the right to modify these terms at any time.
            </p>
          </section>

          <section className="bg-zinc-900 rounded-2xl p-6 border border-zinc-700">
            <h2 className="text-2xl font-bold text-vault-primary mb-4">2. Service Description</h2>
            <p className="text-gray-300 leading-relaxed mb-4">
              Tota Vault is a decentralized platform on the BNB Smart Chain (BSC) that allows:
            </p>
            <ul className="list-disc list-inside text-gray-300 space-y-2 ml-4">
              <li>Creation of BEP-20 tokens (memecoins)</li>
              <li>Trading through automated bonding curves</li>
              <li>Automatic graduation to PancakeSwap when the 13 BNB curve target is reached</li>
              <li>Transparent fee system (2% total per transaction)</li>
            </ul>
          </section>

          <section className="bg-zinc-900 rounded-2xl p-6 border border-zinc-700">
            <h2 className="text-2xl font-bold text-vault-primary mb-4">3. Risks and Responsibilities</h2>
            <div className="bg-red-900/30 border border-red-700 rounded-xl p-4 mb-4">
              <div className="flex items-center space-x-2 mb-2">
                <AlertTriangle className="h-5 w-5 text-red-400" />
                <span className="font-semibold text-red-400">High Risk</span>
              </div>
              <p className="text-gray-300 text-sm">
                Trading memecoins involves an extreme risk of total loss of investment.
              </p>
            </div>
            <ul className="list-disc list-inside text-gray-300 space-y-2 ml-4">
              <li>Memecoins are highly volatile and speculative</li>
              <li>You may lose the entire invested amount</li>
              <li>We do not provide financial advice</li>
              <li>Do your own research (DYOR)</li>
              <li>Only invest what you can afford to lose</li>
            </ul>
          </section>

          <section className="bg-zinc-900 rounded-2xl p-6 border border-zinc-700">
            <h2 className="text-2xl font-bold text-vault-primary mb-4">4. Code of Conduct</h2>
            <p className="text-gray-300 leading-relaxed mb-4">
              It is strictly prohibited to create tokens with:
            </p>
            <ul className="list-disc list-inside text-gray-300 space-y-2 ml-4">
              <li>Nazi, racist, or discriminatory content</li>
              <li>Hate or violence symbols</li>
              <li>Copyright infringement</li>
              <li>Pyramid schemes or frauds</li>
            </ul>
            <p className="text-gray-300 leading-relaxed mt-4">
              Tokens that violate these rules will be permanently banned.
            </p>
          </section>

          <section className="bg-zinc-900 rounded-2xl p-6 border border-zinc-700">
            <h2 className="text-2xl font-bold text-vault-primary mb-4">5. Fees and Payments</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div className="bg-zinc-800 rounded-xl p-4 border border-zinc-600">
                <h3 className="text-vault-primary font-semibold mb-2">Creation Fee</h3>
                <p className="text-white text-2xl font-bold">0.0032 BNB</p>
                <p className="text-gray-400 text-sm">Per token created</p>
              </div>
              <div className="bg-zinc-800 rounded-xl p-4 border border-zinc-600">
                <h3 className="text-vault-primary font-semibold mb-2">Trading Fee</h3>
                <p className="text-white text-2xl font-bold">2%</p>
                <p className="text-gray-400 text-sm">1% protocol + 1% creator</p>
              </div>
              <div className="bg-zinc-800 rounded-xl p-4 border border-zinc-600">
                <h3 className="text-vault-primary font-semibold mb-2">Minimum First Buy</h3>
                <p className="text-white text-2xl font-bold">0.0001 BNB</p>
                <p className="text-gray-400 text-sm">Standard launches · CTO launches require 0.5 BNB</p>
              </div>
              <div className="bg-zinc-800 rounded-xl p-4 border border-zinc-600">
                <h3 className="text-vault-primary font-semibold mb-2">Graduation Target</h3>
                <p className="text-white text-2xl font-bold">13 BNB</p>
                <p className="text-gray-400 text-sm">Curve target before listing on PancakeSwap</p>
              </div>
            </div>
            <p className="text-gray-300 leading-relaxed">
              All fees are automatically charged by smart contracts on BNB Chain and cannot be reversed.
            </p>
          </section>

          <section className="bg-zinc-900 rounded-2xl p-6 border border-zinc-700">
            <h2 className="text-2xl font-bold text-vault-primary mb-4">6. Limitation of Liability</h2>
            <p className="text-gray-300 leading-relaxed mb-4">
              Tota Vault is not responsible for:
            </p>
            <ul className="list-disc list-inside text-gray-300 space-y-2 ml-4">
              <li>Financial losses resulting from trading</li>
              <li>Technical failures or bugs in smart contracts</li>
              <li>Malicious actions by third parties</li>
              <li>Regulatory changes affecting the platform</li>
              <li>Loss of wallet access or private keys</li>
            </ul>
          </section>

          <section className="bg-zinc-900 rounded-2xl p-6 border border-zinc-700">
            <h2 className="text-2xl font-bold text-vault-primary mb-4">7. Intellectual Property</h2>
            <p className="text-gray-300 leading-relaxed">
              You retain all rights over the content you create (names, symbols, descriptions, images). 
              However, by using our platform, you grant us a license to display and process this content 
              as necessary to operate the service.
            </p>
          </section>

          <section className="bg-zinc-900 rounded-2xl p-6 border border-zinc-700">
            <h2 className="text-2xl font-bold text-vault-primary mb-4">8. Modifications and Termination</h2>
            <p className="text-gray-300 leading-relaxed">
              We reserve the right to modify, suspend, or terminate the platform at any time, 
              with or without prior notice. In case of termination, we will make reasonable efforts 
              to notify users in advance.
            </p>
          </section>

          <section className="bg-zinc-900 rounded-2xl p-6 border border-zinc-700">
            <h2 className="text-2xl font-bold text-vault-primary mb-4">9. Governing Law</h2>
            <p className="text-gray-300 leading-relaxed">
              These terms are governed by international blockchain and cryptocurrency regulations. 
              Disputes will be resolved through decentralized arbitration whenever possible.
            </p>
          </section>

          <section className="bg-zinc-900 rounded-2xl p-6 border border-zinc-700">
            <h2 className="text-2xl font-bold text-vault-primary mb-4">10. Contact</h2>
            <p className="text-gray-300 leading-relaxed mb-4">
              For questions about these terms or general support:
            </p>
            <div className="flex flex-wrap gap-4">
              <a
                href="https://t.me/vaulttotakeke"
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 bg-vault-primary hover:bg-vault-primary-hover text-black font-semibold rounded-xl transition-colors duration-200"
              >
                Telegram
              </a>
              <a
                href="https://x.com/vaulttotakeke"
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-600 text-white font-semibold rounded-xl transition-colors duration-200"
              >
                X (Twitter)
              </a>
            </div>
          </section>
        </div>

        <div className="mt-12 bg-zinc-800 rounded-2xl p-6 border border-zinc-600">
          <div className="flex items-center space-x-3 mb-4">
            <Shield className="h-6 w-6 text-vault-primary" />
            <h3 className="text-xl font-bold text-white">Final Agreement</h3>
          </div>
          <p className="text-gray-300 leading-relaxed">
            By using Tota Vault, you confirm that you have read, understood, and agreed to all of the above terms. 
            You also confirm that you are over 18 years old and legally capable of entering into this agreement.
          </p>
        </div>
      </div>
    </div>
  );
};
