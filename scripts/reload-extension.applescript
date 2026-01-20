-- AppleScript to reload the extension in Chrome
-- Requires Chrome to be open with extensions page visible

tell application "Google Chrome"
    activate
    tell active tab of front window
        -- Navigate to extensions page if not already there
        if URL does not contain "chrome://extensions" then
            set URL to "chrome://extensions"
            delay 0.5
        end if
        -- Trigger reload via keyboard shortcut (Cmd+R reloads the page)
        -- The extensions page has a reload button per extension
    end tell
end tell

-- Use keyboard to trigger Developer mode reload
tell application "System Events"
    tell process "Google Chrome"
        -- Cmd+Shift+R to force reload
        keystroke "r" using {command down, shift down}
    end tell
end tell
