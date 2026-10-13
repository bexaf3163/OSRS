package com.osrspath.bridge;

import static org.junit.Assert.*;
import org.junit.Test;

public class GuideDisclosureTest
{
	@Test public void selectedTabTogglesAndSwitchKeepsDetailsOpen()
	{
		GuideDisclosure d = new GuideDisclosure();
		d.forStep("S3-04");
		assertFalse(d.isOpen());
		d.select(false);
		assertTrue(d.isOpen());
		d.select(true);
		assertTrue(d.isOpen());
		d.select(true);
		assertFalse(d.isOpen());
		d.select(false);
		assertTrue(d.isOpen());
		d.forStep("S3-04");
		assertTrue(d.isOpen());
		d.forStep("S3-05");
		assertFalse(d.isOpen());
	}
}
