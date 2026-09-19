package com.helpyou.ai;

import android.os.CancellationSignal;
import androidx.annotation.NonNull;
import androidx.credentials.ClearCredentialStateRequest;
import androidx.credentials.CredentialManager;
import androidx.credentials.CredentialManagerCallback;
import androidx.credentials.exceptions.ClearCredentialException;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.concurrent.Executor;
import java.util.concurrent.Executors;

/**
 * Clears the Android Credential Manager's stored "authorized" Google account state.
 *
 * Why this exists:
 * Android's Credential Manager (which backs Google Sign-In) remembers the last
 * account a user signed in with on this device+app combo. If we only call
 * FirebaseAuthentication.signOut() / Firebase signOut(auth) on logout, that
 * memory is NOT cleared — so the next Google Sign-In attempt silently
 * "Automatic Sign-In"s the same account without showing the account picker.
 *
 * Calling clearCredentialStateAsync() on logout tells all credential providers
 * to forget the active session, so the picker shows again next time.
 */
@CapacitorPlugin(name = "ClearCredential")
public class ClearCredentialPlugin extends Plugin {

    @PluginMethod
    public void clear(PluginCall call) {
        try {
            CredentialManager credentialManager = CredentialManager.create(getContext());
            ClearCredentialStateRequest request = new ClearCredentialStateRequest();
            Executor executor = Executors.newSingleThreadExecutor();

            credentialManager.clearCredentialStateAsync(
                request,
                new CancellationSignal(),
                executor,
                new CredentialManagerCallback<Void, ClearCredentialException>() {
                    @Override
                    public void onResult(Void result) {
                        clearLegacyGoogleSignIn();
                        call.resolve();
                    }

                    @Override
                    public void onError(@NonNull ClearCredentialException e) {
                        clearLegacyGoogleSignIn();
                        JSObject ret = new JSObject();
                        ret.put("warning", e.getMessage() == null ? "unknown" : e.getMessage());
                        call.resolve(ret);
                    }
                }
            );
        } catch (Exception e) {
            clearLegacyGoogleSignIn();
            JSObject ret = new JSObject();
            ret.put("warning", e.getMessage() == null ? "unknown" : e.getMessage());
            call.resolve(ret);
        }
    }

    private void clearLegacyGoogleSignIn() {
        try {
            com.google.android.gms.auth.api.signin.GoogleSignInOptions gso = 
                new com.google.android.gms.auth.api.signin.GoogleSignInOptions.Builder(
                    com.google.android.gms.auth.api.signin.GoogleSignInOptions.DEFAULT_SIGN_IN
                ).build();
            com.google.android.gms.auth.api.signin.GoogleSignInClient client = 
                com.google.android.gms.auth.api.signin.GoogleSignIn.getClient(getContext(), gso);
            client.signOut();
            client.revokeAccess();
        } catch (Exception ignored) {}
    }
}
