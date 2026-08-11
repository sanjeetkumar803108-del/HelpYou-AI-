package com.helpyouai.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        android.widget.Button crashButton = new android.widget.Button(this);
        crashButton.setText("Test Crash");
        crashButton.setOnClickListener(new android.view.View.OnClickListener() {
            public void onClick(android.view.View view) {
                throw new RuntimeException("Test Crash");
            }
        });
        addContentView(crashButton, new android.view.ViewGroup.LayoutParams(
                android.view.ViewGroup.LayoutParams.MATCH_PARENT,
                android.view.ViewGroup.LayoutParams.WRAP_CONTENT));
    }
}
