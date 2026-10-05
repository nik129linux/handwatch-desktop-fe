# D5: polish from review of shots/app-dark-resume.png and app-dark-privacy.png (post D4). Read /home/nico/pf/MOTION-BIBLE.md.

1. Default browser scrollbars show up as a bright white track in the dark theme (Privacy tab). Style ALL scrollbars in the
   app (scrollbar-width: thin; scrollbar-color from tokens; ::-webkit-scrollbar pieces) so they are quiet in dark AND
   light and use only tokens.
2. Privacy tab: "Export my data" and "Delete everything" render as small tracked-caps text like section labels, so they
   do not read as actions. Make them real buttons: Export = secondary pill with a download icon; Delete = destructive
   outline pill (NOT red; use ink/neutral with a trash icon and a confirm step that already exists). Tighten the tab so the
   whole privacy content fits the panel without scrolling at 1440x900 where possible (compact lists, 2-column
   See / Never see), but never clip an action.
3. Resume card: there is a large void between the top "Document · 2 MIN HERE" line and the "RETOMA / You were in Document"
   block. Remove the void: the headline block sits directly under the top line with consistent 24px rhythm.
4. Re-run all tests; regenerate dark/light screenshots (resume, timeline, privacy) and LOOK at each.
Commit "desktop: polish 2". Then `mkdir -p .stage && touch .stage/D5-polish`. Report <= 5 lines.
