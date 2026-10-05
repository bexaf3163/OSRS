package com.osrspath.bridge;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.util.HashMap;
import java.util.Map;
import org.junit.Test;

/** The bank between sessions: written as IDs and numbers, read with distrust - the settings can be edited by hand. */
public class BankSnapshotTest
{
	private static ItemCounts bank()
	{
		ItemCounts b = new ItemCounts();
		b.add(379, ActiveTarget.nameKey("Lobster"), 20);
		b.add(1944, ActiveTarget.nameKey("Egg"), 3);
		b.add(995, ActiveTarget.nameKey("Coins"), 2_000_000_000);
		return b;
	}

	@Test
	public void aWrittenBankIsReadBackWithoutLoss()
	{
		String raw = BankSnapshot.write(bank(), 1_700_000_000_000L);
		BankSnapshot.Loaded l = BankSnapshot.read(raw);
		assertNotNull(l);
		assertEquals(1_700_000_000_000L, l.at);
		Map<Integer, Integer> want = new HashMap<>();
		want.put(379, 20);
		want.put(1944, 3);
		want.put(995, 2_000_000_000);
		assertEquals(want, l.items);
	}

	@Test
	public void anEmptyBankIsKnownToo()
	{
		BankSnapshot.Loaded l = BankSnapshot.read(BankSnapshot.write(new ItemCounts(), 5));
		assertNotNull("an empty bank is 'we know it is empty', not 'unknown'", l);
		assertTrue(l.items.isEmpty());
	}

	@Test
	public void junkIsDiscardedWhole()
	{
		String[] bad = {null, "", "not json", "[]", "{}", "{\"v\":2,\"items\":{}}", "{\"v\":1}", "{\"v\":1,\"items\":[]}",
			"{\"v\":1,\"items\":{\"abc\":1}}", "{\"v\":1,\"items\":{\"0\":1}}", "{\"v\":1,\"items\":{\"379\":0}}", "{\"v\":1,\"items\":{\"379\":-4}}",
			"{\"v\":1,\"items\":{\"999999\":1}}", "{\"v\":1,\"items\":{\"379\":\"many\"}}"};
		for (String raw : bad)
		{
			assertNull("'" + raw + "'", BankSnapshot.read(raw));
		}
	}

	@Test
	public void aTooBigStringIsNotRead()
	{
		assertNull(BankSnapshot.read("{\"v\":1,\"items\":{}," + "\"x\":\"" + "a".repeat(400_001) + "\"}"));
	}

	@Test
	public void theWriteIsLimitedByTheNumberOfItems()
	{
		ItemCounts big = new ItemCounts();
		for (int i = 1; i <= BankSnapshot.MAX_ITEMS + 500; i++)
		{
			big.add(i, "item" + i, 1);
		}
		BankSnapshot.Loaded l = BankSnapshot.read(BankSnapshot.write(big, 1));
		assertNotNull(l);
		assertEquals(BankSnapshot.MAX_ITEMS, l.items.size());
	}

	@Test
	public void idCountsIsACopy()
	{
		ItemCounts b = bank();
		b.idCounts().clear();
		assertEquals(3, b.idCounts().size());
	}
}
