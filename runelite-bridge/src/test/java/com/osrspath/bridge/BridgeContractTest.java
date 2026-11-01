package com.osrspath.bridge;

import static org.junit.Assert.assertEquals;

import com.google.gson.Gson;
import java.io.InputStreamReader;
import java.lang.reflect.Field;
import java.lang.reflect.Modifier;
import java.lang.reflect.ParameterizedType;
import java.lang.reflect.Type;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import org.junit.Test;

/**
 * The plugin reads exactly the fields the app sends on /active-step. bridge-fields.json is the app's list, written by
 * tests/bridgeContract.test.ts, which checks it against the app's payload type. Gson's view of ActiveTarget is walked
 * the same way: "a.b" is a field, "a[]" the items of a list, "a{}" the values of a map.
 */
public class BridgeContractTest
{
	@Test
	public void pluginReadsExactlyWhatTheAppSends()
	{
		Set<String> app = new TreeSet<>(Arrays.asList(new Gson().fromJson(new InputStreamReader(
			BridgeContractTest.class.getResourceAsStream("/bridge-fields.json"), StandardCharsets.UTF_8), String[].class)));
		Set<String> plugin = new TreeSet<>();
		fields(ActiveTarget.class, "", plugin);
		Set<String> appOnly = new TreeSet<>(app);
		appOnly.removeAll(plugin);
		Set<String> pluginOnly = new TreeSet<>(plugin);
		pluginOnly.removeAll(app);
		assertEquals("sent but not read by the plugin: " + appOnly + "; read by the plugin but not sent: " + pluginOnly, app, plugin);
	}

	/** The fields Gson fills: not static, not transient. */
	private static void fields(Class<?> type, String prefix, Set<String> out)
	{
		for (Field f : type.getDeclaredFields())
		{
			if (Modifier.isStatic(f.getModifiers()) || Modifier.isTransient(f.getModifiers()) || f.isSynthetic())
			{
				continue;
			}
			String path = prefix.isEmpty() ? f.getName() : prefix + "." + f.getName();
			out.add(path);
			into(f.getGenericType(), path, out);
		}
	}

	private static void into(Type type, String path, Set<String> out)
	{
		if (type instanceof ParameterizedType)
		{
			ParameterizedType p = (ParameterizedType) type;
			if (List.class.isAssignableFrom((Class<?>) p.getRawType()))
			{
				into(p.getActualTypeArguments()[0], path + "[]", out);
			}
			else if (Map.class.isAssignableFrom((Class<?>) p.getRawType()))
			{
				into(p.getActualTypeArguments()[1], path + "{}", out);
			}
		}
		else if (type instanceof Class && ((Class<?>) type).getName().startsWith("com.osrspath.") && !((Class<?>) type).isEnum())
		{
			fields((Class<?>) type, path, out);
		}
	}
}
