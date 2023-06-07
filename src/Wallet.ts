import {
  Field,
  Permissions,
  SmartContract,
  state,
  State,
  method,
  VerificationKey,
} from 'snarkyjs';

export class WalletBase extends SmartContract {
  @state(Field) num = State<Field>();

  init() {
    super.init();
    this.account.permissions.set({
      ...Permissions.default(),
      send: Permissions.none(),
      receive: Permissions.proofOrSignature(),
      setVerificationKey: Permissions.proofOrSignature(),
    });
    this.num.set(Field(1));
  }

  @method updateVerificationKey(vk: VerificationKey) {
    this.account.verificationKey.set(vk);
  }
}

export class WalletExtended extends WalletBase {
  @method update() {
    const currentState = this.num.getAndAssertEquals();
    const newState = currentState.add(2);
    this.num.set(newState);
  }
}
