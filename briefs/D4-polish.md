# D4: polish from review of app-dark-resume.png / app-light-resume.png (post D2). Read /home/nico/pf/MOTION-BIBLE.md.

1. The "NOW" section inside the Retoma panel is squeezed into a tiny box with its OWN scrollbar above the resume card
   (nested scroller). When the resume card is visible, collapse NOW to a single line ("Document · 1 min") and remove
   every nested scroller in the panel: only the tab body may scroll. Assert: no element inside the panel other than the
   tab body has scrollHeight > clientHeight with overflow auto/scroll.
2. The resume card shows a "SIMULATED" tag. The resume card is not AI. Remove it there. The tag belongs only on the AI
   proposal and must name the real source ("On-device rules" | "Local model · name" | "Cloud · Gemini").
3. In the dark screenshot the Document window is missing from the desktop (present in light). Find out if it is a
   race with the entrance choreography; the screenshot tests must wait for the entrance to finish, and the Document
   window must be present in both themes. Assert all 4 windows visible after the entrance.
4. In light theme the particle field is almost invisible. Tint particles with ink-derived tokens at readable alpha.
5. Re-run all tests, regenerate the dark/light screenshots (resume + timeline + privacy) and LOOK at them.
Commit "desktop: polish". Then `mkdir -p .stage && touch .stage/D4-polish`. Report <= 5 lines.
